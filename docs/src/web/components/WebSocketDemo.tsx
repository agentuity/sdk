import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Input } from './ui';

interface Message {
	id: number;
	type: 'system' | 'echo' | 'heartbeat' | 'error' | 'sent' | 'reconnect';
	message: string;
	timestamp: string;
	original?: string;
}

export function WebSocketDemo() {
	const [messages, setMessages] = useState<Message[]>([]);
	const [inputValue, setInputValue] = useState('');
	const [isConnected, setIsConnected] = useState(false);
	const [isConnecting, setIsConnecting] = useState(false);
	const [isReconnecting, setIsReconnecting] = useState(false);
	const wsRef = useRef<WebSocket | null>(null);
	const messageIdRef = useRef(0);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const wasConnectedRef = useRef(false);
	const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const manualDisconnectRef = useRef(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll when messages change
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages.length]);

	const connect = useCallback((isReconnect = false) => {
		// Prevent multiple connection attempts if already connected or connecting
		if (
			wsRef.current?.readyState === WebSocket.OPEN ||
			wsRef.current?.readyState === WebSocket.CONNECTING
		) {
			return;
		}

		if (isReconnect) {
			setIsReconnecting(true);
		} else {
			setIsConnecting(true);
			manualDisconnectRef.current = false;
		}

		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const ws = new WebSocket(`${protocol}//${window.location.host}/api/websocket/connect`);

		ws.onopen = () => {
			const wasReconnect = isReconnect;
			setIsConnected(true);
			setIsConnecting(false);
			setIsReconnecting(false);
			wasConnectedRef.current = true;

			// Show reconnected message if this was a reconnection
			if (wasReconnect) {
				setMessages((prev) => [
					...prev,
					{
						id: messageIdRef.current++,
						type: 'reconnect',
						message: 'Reconnected successfully',
						timestamp: new Date().toISOString(),
					},
				]);
			}
		};

		ws.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				setMessages((prev) => [
					...prev,
					{
						id: messageIdRef.current++,
						type: data.type,
						message: data.message,
						timestamp: data.timestamp,
						original: data.original,
					},
				]);
			} catch {
				setMessages((prev) => [
					...prev,
					{
						id: messageIdRef.current++,
						type: 'system',
						message: event.data,
						timestamp: new Date().toISOString(),
					},
				]);
			}
		};

		ws.onclose = () => {
			setIsConnected(false);
			setIsConnecting(false);
			wsRef.current = null;

			// Auto-reconnect if we were previously connected and didn't manually disconnect
			if (wasConnectedRef.current && !manualDisconnectRef.current) {
				setIsReconnecting(true);
				setMessages((prev) => [
					...prev,
					{
						id: messageIdRef.current++,
						type: 'reconnect',
						message: 'Connection lost. Reconnecting...',
						timestamp: new Date().toISOString(),
					},
				]);

				// Reconnect after a short delay
				reconnectTimeoutRef.current = setTimeout(() => {
					connect(true);
				}, 2000);
			}
		};

		ws.onerror = () => {
			setIsConnected(false);
			setIsConnecting(false);
			setIsReconnecting(false);
		};

		wsRef.current = ws;
	}, []);

	const disconnect = useCallback(() => {
		manualDisconnectRef.current = true;
		wasConnectedRef.current = false;
		if (reconnectTimeoutRef.current) {
			clearTimeout(reconnectTimeoutRef.current);
			reconnectTimeoutRef.current = null;
		}
		wsRef.current?.close();
		wsRef.current = null;
		setIsConnected(false);
		setIsReconnecting(false);
	}, []);

	const sendMessage = useCallback(() => {
		if (!inputValue.trim() || !wsRef.current) return;

		const message = inputValue.trim();
		try {
			wsRef.current.send(message);
		} catch {
			setMessages((prev) => [
				...prev,
				{
					id: messageIdRef.current++,
					type: 'error',
					message: 'Failed to send message. Connection may have been lost.',
					timestamp: new Date().toISOString(),
				},
			]);
			return;
		}

		setMessages((prev) => [
			...prev,
			{
				id: messageIdRef.current++,
				type: 'sent',
				message: message,
				timestamp: new Date().toISOString(),
			},
		]);

		setInputValue('');
	}, [inputValue]);

	const clearMessages = useCallback(() => {
		setMessages([]);
	}, []);

	useEffect(() => {
		return () => {
			// Prevent reconnection attempts after unmount
			manualDisconnectRef.current = true;
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
			}
			wsRef.current?.close();
		};
	}, []);

	const getMessageStyle = (type: Message['type']) => {
		switch (type) {
			case 'sent':
				return 'border-cyan-500/15 bg-cyan-500/8 ml-6';
			case 'echo':
				return 'border-zinc-800 bg-zinc-950/70 mr-6';
			case 'heartbeat':
				return 'border-transparent bg-transparent px-0 py-1 text-xs text-zinc-500';
			case 'system':
				return 'border-emerald-500/15 bg-emerald-500/8';
			case 'error':
				return 'border-red-500/20 bg-red-500/8';
			case 'reconnect':
				return 'border-amber-500/15 bg-amber-500/8';
			default:
				return 'border-zinc-800 bg-zinc-950/70';
		}
	};

	const getMessageLabel = (type: Message['type']) => {
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
		<div className="rounded-lg border border-zinc-900 bg-black">
			<div className="border-b border-zinc-900 px-4 py-3">
				<div className="flex flex-wrap items-center gap-3">
					<Button
						variant={isConnected ? 'destructive' : 'outline'}
						size="sm"
						onClick={isConnected ? disconnect : () => connect()}
						disabled={isConnecting}
						className="min-h-11 min-w-28 justify-center md:min-h-9"
					>
						{isConnecting ? 'Connecting...' : isConnected ? 'Disconnect' : 'Connect'}
					</Button>

					<div className="flex items-center gap-2 text-sm text-zinc-400" role="status">
						<div
							className={`w-2 h-2 rounded-full ${
								isConnected
									? 'bg-emerald-500'
									: isReconnecting
										? 'bg-yellow-500 animate-pulse'
										: 'bg-zinc-600'
							}`}
						/>
						<span>
							{isConnected
								? 'Connected'
								: isReconnecting
									? 'Reconnecting...'
									: 'Disconnected'}
						</span>
					</div>

					<p className="m-0 text-xs text-zinc-500">
						Heartbeat ping every 15s; reconnects after drops, not page refresh
					</p>

					{messages.length > 0 && (
						<Button
							variant="ghost"
							size="sm"
							onClick={clearMessages}
							className="min-h-11 text-zinc-500 hover:text-zinc-300 md:ml-auto md:min-h-9"
						>
							Clear
						</Button>
					)}
				</div>
			</div>

			<div className="space-y-4 p-4">
				<div className="flex items-center gap-2">
					<Input
						type="text"
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
						placeholder={isConnected ? 'Type a message...' : 'Connect first...'}
						disabled={!isConnected}
						className="min-h-11 flex-1 md:min-h-10"
					/>
					<Button
						variant="outline"
						size="default"
						onClick={sendMessage}
						disabled={!isConnected || !inputValue.trim()}
						className="min-h-11"
					>
						Send
					</Button>
				</div>

				<div
					className="h-64 space-y-2 overflow-y-auto rounded-lg border border-zinc-900 bg-zinc-950/40 p-3"
					role="log"
					aria-live="polite"
					aria-busy={isConnecting || isReconnecting}
				>
					{messages.length === 0 ? (
						<div className="py-10 text-center text-sm text-zinc-500">
							{isConnected
								? 'Send a message to see the route echo it back'
								: 'Connect to open the socket and start sending messages'}
						</div>
					) : (
						messages.map((msg) => (
							<div
								key={msg.id}
								className={`rounded border px-3 py-2 ${getMessageStyle(msg.type)}`}
							>
								<div className="flex items-center justify-between mb-1">
									<span
										className={`text-xs font-medium ${
											msg.type === 'sent'
												? 'text-cyan-300'
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
									className={msg.type === 'heartbeat' ? 'text-zinc-500' : 'text-zinc-100'}
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
