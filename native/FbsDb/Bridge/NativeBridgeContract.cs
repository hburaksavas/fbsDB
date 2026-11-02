using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Json.Nodes;

namespace FbsDb.Bridge;

public sealed record NativeCommandEnvelope(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("command")] string Command,
    [property: JsonPropertyName("tabId")] string TabId,
    [property: JsonPropertyName("payload")] JsonElement Payload);

public static partial class NativeBridgeContract
{
    private static readonly JsonDocument Schema = JsonDocument.Parse(SchemaJson);
    public static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    public static NativeCommandEnvelope ReadCommand(JsonElement message)
    {
        var command = message.Deserialize<NativeCommandEnvelope>(JsonOptions)
            ?? throw new InvalidOperationException("Expected a bridge command.");
        if (command.Type != "command") throw new InvalidOperationException("Expected a bridge command.");
        ValidateIdentity(command.Id, "request identity"); ValidateIdentity(command.TabId, "tab identity");
        Validate(command.Payload, CommandSchema(command.Command).GetProperty("payload"), command.Command);
        return command with { Payload = command.Payload.Clone() };
    }

    public static T ReadPayload<T>(JsonElement payload) => payload.Deserialize<T>(JsonOptions)
        ?? throw new InvalidOperationException("Missing command payload.");

    public static string HandlerFor(string command) => CommandSchema(command).GetProperty("handler").GetString()!;
    public static bool RequiresSessionResume(string command) => CommandSchema(command).GetProperty("resumeSession").GetBoolean();

    public static void ValidateReply(JsonElement message)
    {
        var type = message.GetProperty("type").GetString();
        if (type is null || !Schema.RootElement.GetProperty("replies").TryGetProperty(type, out var shape))
            throw new InvalidOperationException($"Unknown native reply: {type}");
        Validate(message, shape, type);
        if (message.TryGetProperty("tabId", out var tabId)) ValidateIdentity(tabId.GetString(), "tab identity");
    }

    // The host already has a JsonObject to attach request context. Validate it
    // directly so large result sets do not need another full JSON serialization.
    public static void ValidateReply(JsonObject message)
    {
        var type = message["type"]?.GetValue<string>();
        if (type is null || !Schema.RootElement.GetProperty("replies").TryGetProperty(type, out var shape))
            throw new InvalidOperationException($"Unknown native reply: {type}");
        ValidateNode(message, shape, type);
        if (message.ContainsKey("tabId")) ValidateIdentity(message["tabId"]?.GetValue<string>(), "tab identity");
    }

    private static void ValidateNode(JsonNode? value, JsonElement shape, string path)
    {
        if (shape.TryGetProperty("$ref", out var reference))
        { ValidateNode(value, Schema.RootElement.GetProperty("models").GetProperty(reference.GetString()!), path); return; }
        if (value is not JsonObject && value is not JsonArray)
        {
            using var scalar = JsonDocument.Parse(value?.ToJsonString() ?? "null");
            Validate(scalar.RootElement, shape, path); return;
        }
        var kind = value is JsonObject ? "object" : "array";
        if (shape.TryGetProperty("type", out var types) && !(types.ValueKind == JsonValueKind.Array
            ? types.EnumerateArray().Any(type => type.GetString() == kind) : types.GetString() == kind))
            throw new InvalidOperationException($"{path} has an invalid type.");
        if (value is JsonObject obj)
        {
            if (shape.TryGetProperty("required", out var required))
                foreach (var key in required.EnumerateArray())
                    if (!obj.ContainsKey(key.GetString()!)) throw new InvalidOperationException($"{path}.{key.GetString()} is required.");
            if (shape.TryGetProperty("properties", out var properties))
                foreach (var field in properties.EnumerateObject())
                    if (obj.TryGetPropertyValue(field.Name, out var child)) ValidateNode(child, field.Value, path + "." + field.Name);
        }
        else if (value is JsonArray array && shape.TryGetProperty("items", out var items))
            for (var index = 0; index < array.Count; index++) ValidateNode(array[index], items, $"{path}[{index}]");
    }

    private static JsonElement CommandSchema(string? command)
    {
        if (command is null || !Schema.RootElement.GetProperty("commands").TryGetProperty(command, out var shape))
            throw new InvalidOperationException($"Unknown native command: {command}");
        return shape;
    }

    private static void ValidateIdentity(string? value, string label)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 250) throw new InvalidOperationException($"Invalid bridge {label}.");
    }

    private static void Validate(JsonElement value, JsonElement shape, string path)
    {
        if (shape.TryGetProperty("$ref", out var reference))
        { Validate(value, Schema.RootElement.GetProperty("models").GetProperty(reference.GetString()!), path); return; }
        var kind = value.ValueKind switch {
            JsonValueKind.Object => "object", JsonValueKind.Array => "array", JsonValueKind.String => "string",
            JsonValueKind.Number => "number", JsonValueKind.True or JsonValueKind.False => "boolean",
            JsonValueKind.Null => "null", _ => "undefined"
        };
        bool Matches(JsonElement type) => type.GetString() == kind || type.GetString() == "integer" && value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out _);
        if (shape.TryGetProperty("type", out var types) && !(types.ValueKind == JsonValueKind.Array
            ? types.EnumerateArray().Any(Matches) : Matches(types)))
            throw new InvalidOperationException($"{path} has an invalid type.");
        if (shape.TryGetProperty("enum", out var allowed) && !allowed.EnumerateArray().Any(option => JsonElement.DeepEquals(option, value)))
            throw new InvalidOperationException($"{path} is not an allowed value.");
        if (value.ValueKind == JsonValueKind.Number && shape.TryGetProperty("type", out _))
        {
            if (!value.TryGetDouble(out var number) || !double.IsFinite(number) ||
                shape.TryGetProperty("minimum", out var minimum) && number < minimum.GetDouble() ||
                shape.TryGetProperty("maximum", out var maximum) && number > maximum.GetDouble())
                throw new InvalidOperationException($"{path} is out of range.");
        }
        if (value.ValueKind == JsonValueKind.Object)
        {
            if (shape.TryGetProperty("required", out var required))
                foreach (var key in required.EnumerateArray())
                    if (!value.TryGetProperty(key.GetString()!, out _)) throw new InvalidOperationException($"{path}.{key.GetString()} is required.");
            if (shape.TryGetProperty("properties", out var properties))
                foreach (var field in properties.EnumerateObject())
                    if (value.TryGetProperty(field.Name, out var child)) Validate(child, field.Value, path + "." + field.Name);
        }
        if (value.ValueKind == JsonValueKind.Array && shape.TryGetProperty("items", out var items))
        {
            var index = 0;
            foreach (var item in value.EnumerateArray()) Validate(item, items, $"{path}[{index++}]");
        }
    }
}
