import { bridgeContract } from './contract.generated.js';

function validate(value, schema, path) {
  if (schema.$ref) return validate(value, bridgeContract.models[schema.$ref], path);
  const kind = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const types = schema.type == null ? null : Array.isArray(schema.type) ? schema.type : [schema.type];
  const matches = !types || types.includes(kind) || types.includes('integer') && kind === 'number' && Number.isInteger(value);
  if (!matches || kind === 'number' && !Number.isFinite(value)) throw new TypeError(`${path} has an invalid type.`);
  if (schema.enum && !schema.enum.includes(value)) throw new TypeError(`${path} is not an allowed value.`);
  if (kind === 'number' && (schema.minimum != null && value < schema.minimum || schema.maximum != null && value > schema.maximum)) throw new TypeError(`${path} is out of range.`);
  if (kind === 'object') {
    for (const key of schema.required || []) if (!(key in value)) throw new TypeError(`${path}.${key} is required.`);
    for (const [key, field] of Object.entries(schema.properties || {})) if (value[key] !== undefined) validate(value[key], field, `${path}.${key}`);
  }
  if (kind === 'array' && schema.items) value.forEach((item, index) => validate(item, schema.items, `${path}[${index}]`));
}

function identity(value, name) {
  if (typeof value !== 'string' || !value.trim() || value.length > 250) throw new TypeError(`Invalid bridge ${name}.`);
}

export function validateNativeCommand(message) {
  if (message?.type !== 'command') throw new TypeError('Expected a bridge command.');
  identity(message.id, 'request identity');
  identity(message.tabId, 'tab identity');
  if (!Object.hasOwn(bridgeContract.commands, message.command)) throw new TypeError(`Unknown native command: ${message.command}`);
  const command = bridgeContract.commands[message.command];
  validate(message.payload, command.payload, message.command);
  return message;
}

export function validateNativeReply(message) {
  if (!Object.hasOwn(bridgeContract.replies, message?.type)) throw new TypeError(`Unknown native reply: ${message?.type}`);
  const schema = bridgeContract.replies[message.type];
  validate(message, schema, message.type);
  if (message.tabId != null) identity(message.tabId, 'tab identity');
  return message;
}
