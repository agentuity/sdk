import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWebsocket } from '@agentuity/react';
import { Button, Input } from './ui';

/**
 * Shape of messages the server sends over the WebSocket.
 * The hook auto-parses JSON, so we receive these as objects.
 */
interface ServerMessage {
	type: 'system' | 'echo' | 'heartbeat' | 'error';
	message: string;
	timestamp: string;
	original?: string;
}

/**
 * Unified display message type that includes both server messages
 * and locally-tracked sent/reconnect messages.
 */
interface DisplayMessage {
	id: number;
	type: 'system' | 'echo' | 'heartbeat' | 'error' | 'sent' | 'reconnect';
	message: string;
	timestamp: string;
	original?: string;
}

export function WebSocketDemo() {
	// The hook auto-connects on mount and handles reconnection with exponential backoff.
	// Route has no typed schemas, so we cast where needed.
	const {
		isConnected,
		messages: rawServerMessages,
		send: rawSend,
		close,
		clearMessages,
		error,
		readyState,
	} = useWebsocket('/api/websocket/connect', { maxMessages: 100 });

	// Type-safe wrappers for the untyped route
	const serverMessages = rawServerMessages as unknown as ServerMessage[];
	const send = rawSend as unknown as (data: string) => void;

	const [inputValue, setInputValue] = useState('');
	const [localMessages, setLocalMessages] = useState<DisplayMessage[]>([]);
	const messageIdRef = useRef(0);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const prevConnectedRef = useRef(false);
	const hasConnectedOnceRef = useRef(false);

	// Derive reconnecting state: disconnected with an error means the hook
	// is attempting exponential backoff reconnection.
	const isReconnecting = !isConnected && !!error;

	// Merge server messages (mapped to DisplayMessage) with locally tracked
	// sent/reconnect messages, sorted by timestamp.
	const displayMessages = useMemo(() => {
		const mapped: DisplayMessage[] = serverMessages.map((msg, i) => ({
			// Negative IDs for server messages to avoid collision with local IDs
			id: -(i + 1),
			type: msg.type,
			message: msg.message,
			timestamp: msg.timestamp,
			original: msg.original,
		}));
		return [...mapped, ...localMessages].sort(
			(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
		);
	}, [serverMessages, localMessages]);

	// Track reconnection events: if we were disconnected and are now connected
	// again (after having connected at least once), add a reconnect message.
	useEffect(() => {
		if (isConnected && !prevConnectedRef.current && hasConnectedOnceRef.current) {
			setLocalMessages((prev) => [
				...prev,
				{
					id: messageIdRef.current++,
					type: 'reconnect',
					message: 'Reconnected successfully',
					timestamp: new Date().toISOString(),
				},
			]);
		}
		if (isConnected) {
			hasConnectedOnceRef.current = true;
		}
		prevConnectedRef.current = isConnected;
	}, [isConnected]);

	// Add a "connection lost" local message when we transition to reconnecting
	const prevReconnectingRef = useRef(false);
	useEffect(() => {
		if (isReconnecting && !prevReconnectingRef.current && hasConnectedOnceRef.current) {
			setLocalMessages((prev) => [
				...prev,
				{
					id: messageIdRef.current++,
					type: 'reconnect',
					message: 'Connection lost. Reconnecting...',
					timestamp: new Date().toISOString(),
				},
			]);
		}
		prevReconnectingRef.current = isReconnecting;
	}, [isReconnecting]);

	// Scroll to bottom when new messages arrive
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll when messages change
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [displayMessages.length]);

	const sendMessage = useCallback(() => {
		if (!inputValue.trim() || !isConnected) return;
		const message = inputValue.trim();
		send(message);
		setLocalMessages((prev) => [
			...prev,
			{
				id: messageIdRef.current++,
				type: 'sent',
				message,
				timestamp: new Date().toISOString(),
			},
		]);
		setInputValue('');
	}, [inputValue, isConnected, send]);

	const handleClear = useCallback(() => {
		clearMessages();
		setLocalMessages([]);
	}, [clearMessages]);

	const getMessageStyle = (type: DisplayMessage['type']) => {
		switch (type) {
			case 'sent':
				return 'bg-cyan-900/30 border-cyan-500/50 ml-8';
			case 'echo':
				return 'bg-zinc-800/50 border-zinc-700/50 mr-8';
			case 'heartbeat':
				return 'bg-zinc-900/50 border-zinc-800/50 text-zinc-500 text-xs';
			case 'system':
				return 'bg-emerald-900/30 border-emerald-700/50';
			case 'error':
				return 'bg-red-900/30 border-red-700/50';
			case 'reconnect':
				return 'bg-yellow-900/30 border-yellow-700/50';
			default:
				return 'bg-zinc-800/50 border-zinc-700/50';
		}
	};

	const getMessageLabel = (type: DisplayMessage['type']) => {
		switch (type) {
			case 'sent':
				return 'You';
			case 'echo':
				return 'Server';
			case 'heartbeat':
				return 'Heartbeat';
			case 'system':
				return 'System';
			case 'error':
				return 'Error';
			case 'reconnect':
				return 'Connection';
			default:
				return type;
		}
	};

	return (
		<div className="space-y-4">
			{/* Interactive Demo */}
			<div className="bg-black border border-zinc-900 rounded-lg p-4">
				<p className="text-zinc-600 text-xs m-0 mb-4">
					Auto-connects on mount. The SDK hook handles reconnection with exponential backoff.
				</p>

				{/* Connection Controls */}
				<div className="flex items-center gap-4 mb-4">
					<Button
						variant="destructive"
						size="sm"
						onClick={close}
						disabled={!isConnected}
					>
						Disconnect
					</Button>

					<div className="flex items-center gap-2">
						<div
							className={`w-2 h-2 rounded-full ${
								isConnected
									? 'bg-emerald-500'
									: isReconnecting
										? 'bg-yellow-500 animate-pulse'
										: 'bg-zinc-600'
							}`}
						/>
						<span className="text-sm text-zinc-400">
							{isConnected
								? 'Connected'
								: isReconnecting
									? 'Reconnecting...'
									: readyState === 0
										? 'Connecting...'
										: 'Disconnected'}
						</span>
					</div>

					{displayMessages.length > 0 && (
						<Button
							variant="ghost"
							size="xs"
							onClick={handleClear}
							className="text-zinc-500 hover:text-zinc-300"
						>
							Clear messages
						</Button>
					)}
				</div>

				{/* Message Input */}
				<div className="flex items-center gap-2 mb-4">
					<Input
						type="text"
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
						placeholder={isConnected ? 'Type a message...' : 'Waiting for connection...'}
						disabled={!isConnected}
						className="flex-1"
					/>
					<Button
						variant="outline"
						size="default"
						onClick={sendMessage}
						disabled={!isConnected || !inputValue.trim()}
					>
						Send
					</Button>
				</div>

				{/* Messages */}
				<div className="bg-black border border-zinc-800 rounded-lg h-64 overflow-y-auto p-3 space-y-2">
					{displayMessages.length === 0 ? (
						<div className="text-zinc-600 text-sm text-center py-8">
							{isConnected
								? 'Send a message to start...'
								: 'Connecting to WebSocket server...'}
						</div>
					) : (
						displayMessages.map((msg) => (
							<div
								key={msg.id}
								className={`border rounded px-3 py-2 ${getMessageStyle(msg.type)}`}
							>
								<div className="flex items-center justify-between mb-1">
									<span
										className={`text-xs font-medium ${
											msg.type === 'sent'
												? 'text-cyan-600 dark:text-cyan-400'
												: msg.type === 'heartbeat'
													? 'text-zinc-500'
													: 'text-zinc-400'
										}`}
									>
										{getMessageLabel(msg.type)}
									</span>
									<span className="text-xs text-zinc-600">
										{new Date(msg.timestamp).toLocaleTimeString()}
									</span>
								</div>
								<div
									className={`${msg.type === 'heartbeat' ? 'text-zinc-500' : 'text-white'}`}
								>
									{msg.message}
								</div>
							</div>
						))
					)}
					<div ref={messagesEndRef} />
				</div>
			</div>
		</div>
	);
}
