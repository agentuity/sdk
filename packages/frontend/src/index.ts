export { getProcessEnv } from './env';
export { buildUrl, defaultBaseUrl } from './url';
export { resolveDevWebSocketUrl } from './dev-ws';
export { deserializeData } from './serialization';
export { createReconnectManager, type ReconnectOptions, type ReconnectManager } from './reconnect';
export { jsonEqual } from './memo';
export {
	WebSocketManager,
	type MessageHandler as WebSocketMessageHandler,
	type WebSocketCallbacks,
	type WebSocketManagerOptions,
	type WebSocketManagerState,
} from './websocket-manager';
export {
	EventStreamManager,
	type MessageHandler as EventStreamMessageHandler,
	type EventStreamCallbacks,
	type EventStreamManagerOptions,
	type EventStreamManagerState,
} from './eventstream-manager';
export {
	WebRTCManager,
	UserMediaSource,
	DisplayMediaSource,
	CustomStreamSource,
	type WebRTCManagerOptions,
	type WebRTCManagerState,
	type WebRTCClientCallbacks,
	type TrackSource,
} from './webrtc-manager';

// Re-export core WebRTC types for convenience
export type {
	WebRTCConnectionState,
	WebRTCDisconnectReason,
	DataChannelConfig,
	DataChannelMessage,
	DataChannelState,
	ConnectionQualitySummary,
	RecordingOptions,
	RecordingHandle,
	RecordingState,
} from '@agentuity/core';
