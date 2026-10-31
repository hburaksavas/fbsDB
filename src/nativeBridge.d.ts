import type { NativeReply, SendNativeCommand } from './bridge/contract.generated.js';
export declare const isNativeHost: boolean;
export declare const sendNativeCommand: SendNativeCommand;
export declare function setNativeTabId(tabId: string): void;
export declare function getNativeTabId(): string;
export declare function subscribeNativeMessages(listener: (message: NativeReply) => void): () => void;
export declare function announceUiReady(): void;
