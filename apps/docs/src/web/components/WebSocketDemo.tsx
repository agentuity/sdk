import { useCallback, useEffect, useRef, useState } from 'react';

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
				return 'bg-cyan-900/30 border-cyan-700/50 ml-8';
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
		<div className="space-y-6">
			{/* Interactive Demo */}
			<div className="bg-black border border-zinc-900 rounded-lg p-6">
				<p className="text-zinc-600 text-xs m-0 mb-4">
					Note: Connections don't persist across page refresh
				</p>

				{/* Connection Controls */}
				<div className="flex items-center gap-4 mb-4">
					<button
						type="button"
						onClick={isConnected ? disconnect : () => connect()}
						disabled={isConnecting}
						className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
							isConnected
								? 'bg-red-600 hover:bg-red-700 text-white'
								: isConnecting
									? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
									: 'bg-cyan-400 hover:bg-cyan-300 text-black'
						}`}
					>
						{isConnecting ? 'Connecting...' : isConnected ? 'Disconnect' : 'Connect'}
					</button>

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
									: 'Disconnected'}
						</span>
					</div>

					{messages.length > 0 && (
						<button
							type="button"
							onClick={clearMessages}
							className="px-3 py-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
						>
							Clear messages
						</button>
					)}
				</div>

				{/* Message Input */}
				<div className="flex gap-2 mb-4">
					<input
						type="text"
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
						placeholder={isConnected ? 'Type a message...' : 'Connect first...'}
						disabled={!isConnected}
						className="flex-1 bg-black border border-zinc-800 rounded px-3 py-2 text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 disabled:opacity-50"
					/>
					<button
						type="button"
						onClick={sendMessage}
						disabled={!isConnected || !inputValue.trim()}
						className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 disabled:bg-zinc-800 disabled:text-zinc-600 text-black rounded transition-colors"
					>
						Send
					</button>
				</div>

				{/* Messages */}
				<div className="bg-black border border-zinc-800 rounded-lg h-64 overflow-y-auto p-3 space-y-2">
					{messages.length === 0 ? (
						<div className="text-zinc-600 text-sm text-center py-8">
							{isConnected ? 'Send a message to start...' : 'Click Connect to start'}
						</div>
					) : (
						messages.map((msg) => (
							<div
								key={msg.id}
								className={`border rounded px-3 py-2 ${getMessageStyle(msg.type)}`}
							>
								<div className="flex items-center justify-between mb-1">
									<span
										className={`text-xs font-medium ${
											msg.type === 'sent'
												? 'text-cyan-400'
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

			{/* Features */}
			<div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
				<h2 className="text-lg font-normal text-white mb-4">WebSocket vs SSE</h2>

				<div className="grid grid-cols-2 gap-4">
					<div className="space-y-2">
						<h3 className="text-cyan-400 font-medium">WebSocket</h3>
						<ul className="text-sm text-zinc-400 space-y-1">
							<li>Bidirectional (client + server)</li>
							<li>Single persistent connection</li>
							<li>Binary and text data</li>
							<li>Auto-reconnect (custom, as shown here)</li>
							<li>Real-time chat, games, collaboration</li>
						</ul>
					</div>
					<div className="space-y-2">
						<h3 className="text-zinc-400 font-medium">SSE (Server-Sent Events)</h3>
						<ul className="text-sm text-zinc-500 space-y-1">
							<li>Server to client only</li>
							<li>Auto-reconnect (browser built-in)</li>
							<li>Text data only</li>
							<li>LLM streaming, notifications</li>
						</ul>
					</div>
				</div>
			</div>
		</div>
	);
}
