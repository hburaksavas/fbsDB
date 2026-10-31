using System.Text.Json;
using System.Text.Json.Nodes;

namespace FbsDb.Services;

// Organization contains stable profile references only; never targets or credentials.
public static class ConnectionOrganization
{
    public static string Read(JsonObject item, string key) => item[key]?.GetValue<string>() ?? "";
    public static JsonObject Ensure(JsonObject settings)
    {
        var organization = settings["connectionOrganization"] as JsonObject;
        if (organization is null)
        {
            if (settings.ContainsKey("connectionOrganization")) throw new InvalidOperationException("Connection organization is invalid; existing data was preserved.");
            settings["connectionOrganization"] = organization = new JsonObject { ["version"] = 1, ["folders"] = new JsonArray(), ["groups"] = new JsonArray(), ["assignments"] = new JsonObject() };
        }
        if (organization["version"]?.GetValue<int>() != 1 || organization["folders"] is not JsonArray || organization["groups"] is not JsonArray || organization["assignments"] is not JsonObject)
            throw new InvalidOperationException("Unsupported connection organization; existing data was preserved.");
        var assignments = organization["assignments"]!.AsObject();
        foreach (var profile in (settings["connectionProfiles"] as JsonArray ?? []).OfType<JsonObject>())
        {
            var id = Read(profile, "id");
            if (assignments.ContainsKey(id)) continue;
            var legacy = settings["connectionGroups"] as JsonObject;
            var name = legacy?.ContainsKey(id) == true ? legacy[id]?.GetValue<string>() ?? "" : Read(profile, "environment") switch { "DEV" => "Development", "TEST" or "UAT" => "Testing", "PROD" => "Production", _ => "" };
            assignments[id] = new JsonObject { ["folderId"] = null, ["groupIds"] = new JsonArray() };
            if (!string.IsNullOrWhiteSpace(name)) assignments[id]!["groupIds"]!.AsArray().Add(Group(organization, name));
        }
        Validate(organization);
        return organization;
    }
    public static string Group(JsonObject organization, string name)
    {
        name = Name(name);
        var groups = organization["groups"]!.AsArray();
        var existing = groups.OfType<JsonObject>().FirstOrDefault(g => string.Equals(Read(g, "name"), name, StringComparison.OrdinalIgnoreCase));
        if (existing is not null) return Read(existing, "id");
        var id = Guid.NewGuid().ToString("N"); groups.Add(new JsonObject { ["id"] = id, ["name"] = name }); return id;
    }
    public static void Assign(JsonObject organization, string profileId, string? folderId, IEnumerable<string> groupIds)
    {
        organization["assignments"]![profileId] = new JsonObject { ["folderId"] = string.IsNullOrEmpty(folderId) ? null : folderId, ["groupIds"] = new JsonArray(groupIds.Distinct().Select(id => (JsonNode?)JsonValue.Create(id)).ToArray()) };
        Validate(organization);
    }
    public static void Apply(JsonObject organization, JsonElement payload, IEnumerable<string> profileIds)
    {
        string Get(string key) => payload.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString()! : "";
        var operation = Get("operation"); var id = Get("id"); var folders = organization["folders"]!.AsArray(); var groups = organization["groups"]!.AsArray();
        var collection = operation.StartsWith("folder.", StringComparison.Ordinal) ? folders : groups;
        var item = collection.OfType<JsonObject>().FirstOrDefault(f => Read(f, "id") == id);
        switch (operation)
        {
            case "folder.create": folders.Add(new JsonObject { ["id"] = Guid.NewGuid().ToString("N"), ["name"] = Name(Get("name")), ["parentId"] = string.IsNullOrEmpty(Get("parentId")) ? null : Get("parentId") }); break;
            case "group.create":
                if (groups.OfType<JsonObject>().Any(g => string.Equals(Read(g, "name"), Get("name").Trim(), StringComparison.OrdinalIgnoreCase))) throw new InvalidOperationException("A group with this name already exists.");
                Group(organization, Get("name")); break;
            case "folder.rename": case "group.rename":
                if (item is null) throw new InvalidOperationException("Item no longer exists."); item["name"] = Name(Get("name")); break;
            case "folder.move":
                if (item is null) throw new InvalidOperationException("Folder no longer exists."); item["parentId"] = string.IsNullOrEmpty(Get("parentId")) ? null : Get("parentId"); break;
            case "folder.delete":
                if (item is null) throw new InvalidOperationException("Folder no longer exists.");
                if (folders.OfType<JsonObject>().Any(f => Read(f, "parentId") == id) || organization["assignments"]!.AsObject().Any(a => a.Value is JsonObject value && Read(value, "folderId") == id)) throw new InvalidOperationException("Move the connections and subfolders before deleting this folder.");
                folders.Remove(item); break;
            case "group.delete":
                if (item is null) throw new InvalidOperationException("Group no longer exists."); groups.Remove(item);
                foreach (var assignment in organization["assignments"]!.AsObject()) if (assignment.Value is JsonObject value) value["groupIds"] = new JsonArray(value["groupIds"]!.AsArray().Where(g => g!.GetValue<string>() != id).Select(g => g!.DeepClone()).ToArray());
                break;
            case "profile.assign":
                if (!profileIds.Contains(Get("profileId"))) throw new InvalidOperationException("Connection no longer exists.");
                Assign(organization, Get("profileId"), Get("folderId"), payload.GetProperty("groupIds").EnumerateArray().Select(g => g.GetString()!)); break;
            default: throw new InvalidOperationException("Unsupported connection organization command.");
        }
        Validate(organization);
    }
    private static string Name(string value)
    {
        value = value.Trim();
        if (value.Length is < 1 or > 80 || value.Any(char.IsControl)) throw new InvalidOperationException("Enter a name between 1 and 80 characters.");
        return value;
    }
    public static void Validate(JsonObject organization)
    {
        var folders = organization["folders"]!.AsArray().OfType<JsonObject>().ToArray(); var groups = organization["groups"]!.AsArray().OfType<JsonObject>().ToArray();
        if (folders.Length > 500 || groups.Length > 500) throw new InvalidOperationException("Up to 500 folders and groups are supported.");
        if (folders.Length != organization["folders"]!.AsArray().Count || groups.Length != organization["groups"]!.AsArray().Count) throw new InvalidOperationException("Invalid organization item.");
        foreach (var collection in new[] { folders, groups })
        {
            if (collection.Select(i => Read(i, "id")).Distinct().Count() != collection.Length || collection.Any(i => string.IsNullOrWhiteSpace(Read(i, "id")))) throw new InvalidOperationException("Organization identities must be unique.");
            foreach (var item in collection) Name(Read(item, "name"));
            if (collection.GroupBy(i => (Read(i, "parentId"), Read(i, "name").Trim().ToUpperInvariant())).Any(g => g.Count() > 1)) throw new InvalidOperationException("An item with this name already exists here.");
        }
        var byId = folders.ToDictionary(f => Read(f, "id"));
        foreach (var folder in folders)
        {
            var seen = new HashSet<string>(); var id = Read(folder, "id");
            while (id.Length > 0) { if (!seen.Add(id)) throw new InvalidOperationException("A folder cannot be moved inside itself or a descendant."); if (!byId.TryGetValue(id, out var current)) throw new InvalidOperationException("Parent folder no longer exists."); id = Read(current, "parentId"); }
        }
        var groupIds = groups.Select(g => Read(g, "id")).ToHashSet();
        foreach (var assignment in organization["assignments"]!.AsObject())
        {
            if (assignment.Value is not JsonObject value || value["groupIds"] is not JsonArray ids) throw new InvalidOperationException("Invalid connection assignment.");
            if (Read(value, "folderId") is { Length: > 0 } folder && !byId.ContainsKey(folder)) throw new InvalidOperationException("Folder no longer exists.");
            if (ids.Any(id => id is null || !groupIds.Contains(id.GetValue<string>()))) throw new InvalidOperationException("Group no longer exists.");
        }
    }
}
