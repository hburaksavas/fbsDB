import { sendNativeCommand, subscribeNativeMessages } from '../src/nativeBridge.js';

sendNativeCommand('file.save', { content: 'SELECT 1', path: null, diskVersion: null });
sendNativeCommand('sql.cancel');
sendNativeCommand('completion.cancel', { requestId: 'metadata-1', tabId: 'a' });
sendNativeCommand('sql.execute', { sql: 'SELECT :id FROM dual', parameters: [{ name: 'id', type: 'NUMBER', value: '42' }] });
// @ts-expect-error A save must carry its content.
sendNativeCommand('file.save');
// @ts-expect-error SQL text is a string.
sendNativeCommand('sql.execute', { sql: 42 });
// @ts-expect-error Unknown command names cannot cross the bridge.
sendNativeCommand('file.destroy', {});
// @ts-expect-error A cancellation identifies the request it cancels.
sendNativeCommand('completion.cancel', { requestId: 42 });
// @ts-expect-error A bind requires its type.
sendNativeCommand('sql.execute', { sql: 'SELECT :id FROM dual', parameters: [{ name: 'id' }] });
subscribeNativeMessages(message => {
  if (message.type === 'file.saved') {
    const version: string = message.diskVersion;
    void version;
    // @ts-expect-error Saved file versions are strings.
    const wrong: number = message.diskVersion;
    void wrong;
  }
});
