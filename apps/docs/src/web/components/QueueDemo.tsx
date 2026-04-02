import { AlertTriangle, Check, Inbox, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePersistentDemoState } from '../hooks/usePersistentDemoState';
import { Badge, Button, Separator } from './ui';

const MESSAGE_PAYLOAD = { task: 'process-order', orderId: 'order-123' };

type ActionType = 'setup' | 'reset' | 'publish' | 'receive' | 'ack' | 'nack' | 'dlq' | 'replay';

interface QueueEvent {
	id: number;
	action: ActionType;
	messageId?: string;
	detail: string;
	timestamp: string;
}

interface QueueMessage {
	id: string;
	payload: unknown;
	state?: string;
	delivery_attempts?: number;
}

interface DlqMessage {
	id: string;
	payload: unknown;
	failure_reason?: string;
	delivery_attempts?: number;
}

interface QueueStats {
	message_count: number;
	dlq_count: number;
	name: string;
	queue_type: string;
}

async function api<T = unknown>(path: string, options?: RequestInit): Promise<T> {
	const resp = await fetch(`/api/queue${path}`, options);
	if (!resp.ok) {
		throw new Error(`HTTP ${resp.status}`);
	}
	return resp.json();
}

export function QueueDemo() {
	const [queueReady, setQueueReady] = usePersistentDemoState<boolean>('queue', 'ready', {
		defaultValue: false,
		storage: 'session',
	});
	const [receivedMessage, setReceivedMessage] = useState<QueueMessage | null>(null);
	const [events, setEvents, resetEvents] = usePersistentDemoState<QueueEvent[]>(
		'queue',
		'events',
		{
			defaultValue: [],
			storage: 'session',
		}
	);
	const [dlqMessages, setDlqMessages] = useState<DlqMessage[]>([]);
	const [stats, setStats] = useState<QueueStats | null>(null);
	const [loading, setLoading] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const eventIdRef = useRef(events.length);
	const eventsEndRef = useRef<HTMLDivElement>(null);

	const addEvent = useCallback((action: ActionType, detail: string, messageId?: string) => {
		setEvents((prev) => [
			...prev,
			{
				id: eventIdRef.current++,
				action,
				messageId,
				detail,
				timestamp: new Date().toISOString(),
			},
		]);
	}, []);

	const clearDemoState = useCallback(() => {
		setReceivedMessage(null);
		setDlqMessages([]);
		setStats(null);
		resetEvents();
		eventIdRef.current = 0;
	}, [resetEvents]);

	const refreshStats = useCallback(async () => {
		try {
			const result = await api<{ success: boolean; data?: QueueStats }>('/status');
			if (result.success && result.data) {
				setStats(result.data);
			}
		} catch {
			// Stats refresh is best-effort
		}
	}, []);

	const refreshDlq = useCallback(async () => {
		try {
			const result = await api<{ success: boolean; data?: { messages: DlqMessage[] } }>('/dlq');
			if (result.success && result.data) {
				setDlqMessages(result.data.messages);
			}
		} catch {
			// DLQ refresh is best-effort
		}
	}, []);

	const refreshQueueState = useCallback(async () => {
		await Promise.allSettled([refreshStats(), refreshDlq()]);
	}, [refreshDlq, refreshStats]);

	useEffect(() => {
		if (!queueReady) {
			return;
		}

		void refreshQueueState();
		const intervalId = window.setInterval(() => {
			void refreshQueueState();
		}, 2000);

		return () => window.clearInterval(intervalId);
	}, [queueReady, refreshQueueState]);

	// Scroll events to bottom on new events
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll when events change
	useEffect(() => {
		eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [events.length]);

	const handleSetup = async () => {
		setLoading('setup');
		setError(null);
		try {
			const result = await api<{ success: boolean; message: string }>('/setup', {
				method: 'POST',
			});
			if (result.success) {
				clearDemoState();
				setQueueReady(true);
				addEvent('setup', result.message);
				await refreshQueueState();
			} else {
				setError(result.message);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to setup queue');
		} finally {
			setLoading(null);
		}
	};

	const handleReset = async () => {
		setLoading('reset');
		setError(null);
		try {
			const result = await api<{ success: boolean; message: string }>('/reset', {
				method: 'POST',
			});
			if (result.success) {
				clearDemoState();
				setQueueReady(true);
				addEvent('reset', result.message);
				await refreshQueueState();
			} else {
				setError(result.message);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to reset queue');
		} finally {
			setLoading(null);
		}
	};

	const handlePublish = async () => {
		setLoading('publish');
		setError(null);
		try {
			const result = await api<{ success: boolean; message: string; data?: { id: string } }>(
				'/publish',
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ payload: MESSAGE_PAYLOAD }),
				}
			);
			if (result.success) {
				const messageId = result.data?.id;
				addEvent(
					'publish',
					messageId ? `Published message ${messageId}` : result.message,
					messageId
				);
				await refreshQueueState();
			} else {
				setError(result.message);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to publish');
		} finally {
			setLoading(null);
		}
	};

	const handleReceive = async () => {
		setLoading('receive');
		setError(null);
		try {
			const result = await api<{
				success: boolean;
				data?: QueueMessage | null;
				message?: string;
			}>('/receive');
			if (result.success && result.data) {
				setReceivedMessage(result.data);
				addEvent('receive', `Received ${result.data.id}`, result.data.id);
				await refreshQueueState();
			} else {
				addEvent('receive', result.message || 'No messages available');
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to receive');
		} finally {
			setLoading(null);
		}
	};

	const handleAck = async () => {
		if (!receivedMessage) return;
		setLoading('ack');
		setError(null);
		try {
			const result = await api<{ success: boolean; message: string }>(
				`/ack/${receivedMessage.id}`,
				{ method: 'POST' }
			);
			if (result.success) {
				addEvent('ack', `Acknowledged ${receivedMessage.id}`, receivedMessage.id);
				setReceivedMessage(null);
				await refreshQueueState();
			} else {
				setError(result.message);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to ack');
		} finally {
			setLoading(null);
		}
	};

	const handleNack = async () => {
		if (!receivedMessage) return;
		setLoading('nack');
		setError(null);
		try {
			const result = await api<{ success: boolean; message: string }>(
				`/nack/${receivedMessage.id}`,
				{ method: 'POST' }
			);
			if (result.success) {
				addEvent(
					'nack',
					`Nacked ${receivedMessage.id} — returned to queue`,
					receivedMessage.id
				);
				setReceivedMessage(null);
				await refreshQueueState();
			} else {
				setError(result.message);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to nack');
		} finally {
			setLoading(null);
		}
	};

	const handleReplay = async (messageId: string) => {
		setLoading('replay');
		setError(null);
		try {
			const result = await api<{ success: boolean; message: string }>(`/dlq/${messageId}`, {
				method: 'POST',
			});
			if (result.success) {
				addEvent('replay', `Replayed ${messageId}`, messageId);
				setDlqMessages((prev) => prev.filter((m) => m.id !== messageId));
				await refreshQueueState();
			} else {
				setError(result.message);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to replay');
		} finally {
			setLoading(null);
		}
	};

	const getEventColor = (action: ActionType) => {
		switch (action) {
			case 'setup':
			case 'reset':
				return 'text-zinc-400';
			case 'publish':
				return 'text-cyan-400';
			case 'receive':
				return 'text-blue-400';
			case 'ack':
				return 'text-emerald-400';
			case 'nack':
				return 'text-red-400';
			case 'dlq':
				return 'text-orange-400';
			case 'replay':
				return 'text-yellow-400';
		}
	};

	const getEventBorder = (action: ActionType) => {
		switch (action) {
			case 'setup':
			case 'reset':
				return 'border-zinc-300 dark:border-zinc-800';
			case 'publish':
				return 'border-cyan-300 dark:border-cyan-500/30';
			case 'receive':
				return 'border-blue-300 dark:border-blue-500/30';
			case 'ack':
				return 'border-emerald-300 dark:border-emerald-500/30';
			case 'nack':
				return 'border-red-300 dark:border-red-500/30';
			case 'dlq':
				return 'border-orange-300 dark:border-orange-500/30';
			case 'replay':
				return 'border-yellow-300 dark:border-yellow-500/30';
		}
	};

	return (
		<div className="flex flex-col gap-4">
			{/* Stats Bar */}
			{stats && (
				<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg px-4 py-3 flex items-center gap-6">
					<div className="flex items-center gap-2">
						<span className="text-zinc-500 text-xs uppercase">Queue</span>
						<span className="text-zinc-900 dark:text-white text-sm font-mono">
							{stats.name}
						</span>
						<Badge variant="secondary" className="text-[10px]">
							{stats.queue_type}
						</Badge>
					</div>
					<div className="flex items-center gap-4 ml-auto">
						<div className="flex items-center gap-1.5">
							<Inbox className="size-3 text-zinc-500" />
							<span className="text-zinc-900 dark:text-white text-sm font-mono">
								{stats.message_count}
							</span>
							<span className="text-zinc-500 text-xs">pending</span>
						</div>
						<div className="flex items-center gap-1.5">
							<AlertTriangle className="size-3 text-orange-500" />
							<span className="text-zinc-900 dark:text-white text-sm font-mono">
								{stats.dlq_count}
							</span>
							<span className="text-zinc-500 text-xs">DLQ</span>
						</div>
					</div>
				</div>
			)}

			{/* Error display */}
			{error && (
				<div className="bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-900 rounded-lg text-red-700 dark:text-red-300 text-sm p-4">
					{error}
				</div>
			)}

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
				{/* Left Panel — Controls */}
				<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg p-4">
					<div className="flex flex-col gap-4">
						{/* Setup */}
						{!queueReady && (
							<div>
								<span className="text-zinc-500 dark:text-zinc-400 block text-xs mb-2 uppercase">
									Setup
								</span>
								<Button
									onClick={handleSetup}
									disabled={loading === 'setup'}
									variant="outline"
									size="default"
								>
									<span className="relative">
										<span className={loading === 'setup' ? 'invisible' : ''}>
											Setup Queue
										</span>
										{loading === 'setup' && (
											<span
												className="absolute inset-0 flex items-center justify-center"
												data-loading="true"
											/>
										)}
									</span>
								</Button>
							</div>
						)}

						{/* Publish */}
						{queueReady && (
							<>
								<div>
									<span className="text-zinc-500 dark:text-zinc-400 block text-xs mb-1 uppercase">
										Payload
									</span>
									<code className="text-xs font-mono text-cyan-600 dark:text-cyan-400">
										{JSON.stringify(MESSAGE_PAYLOAD)}
									</code>
								</div>

								<div className="flex items-center gap-2">
									<Button
										onClick={handlePublish}
										disabled={!!loading}
										variant="outline"
										size="default"
									>
										<span className="relative">
											<span className={loading === 'publish' ? 'invisible' : ''}>
												Publish
											</span>
											{loading === 'publish' && (
												<span
													className="absolute inset-0 flex items-center justify-center"
													data-loading="true"
												/>
											)}
										</span>
									</Button>
									<Button
										onClick={handleReceive}
										disabled={!!loading || !!receivedMessage}
										variant="ghost"
										size="sm"
									>
										<Inbox className="size-3.5" />
										Receive Next
									</Button>
									<Button
										onClick={handleReset}
										disabled={!!loading}
										variant="ghost"
										size="sm"
									>
										<RotateCcw className="size-3.5" />
										Reset
									</Button>
								</div>
							</>
						)}

						{/* Received Message Actions */}
						{receivedMessage && (
							<>
								<Separator />
								<div>
									<span className="text-zinc-500 dark:text-zinc-400 block text-xs mb-2 uppercase">
										Received Message
									</span>
									<div className="bg-zinc-100 dark:bg-zinc-950 rounded-md p-3 mb-3">
										<div className="text-xs font-mono text-zinc-500 mb-1">
											{receivedMessage.id}
										</div>
										<pre className="text-xs font-mono text-zinc-900 dark:text-zinc-300 m-0 whitespace-pre-wrap">
											{JSON.stringify(receivedMessage.payload, null, 2)}
										</pre>
										{receivedMessage.delivery_attempts !== undefined && (
											<div className="text-xs text-zinc-500 mt-1">
												Attempts: {receivedMessage.delivery_attempts}
											</div>
										)}
									</div>
									<div className="flex items-center gap-2">
										<Button
											onClick={handleAck}
											disabled={!!loading}
											variant="success"
											size="sm"
										>
											<Check className="size-3.5" />
											Ack
										</Button>
										<Button
											onClick={handleNack}
											disabled={!!loading}
											variant="destructive"
											size="sm"
										>
											<X className="size-3.5" />
											Nack
										</Button>
									</div>
								</div>
							</>
						)}

						{/* DLQ Section (always visible when queue is ready) */}
						{queueReady && (
							<>
								<Separator />
								<div>
									<div className="flex items-center justify-between mb-2">
										<span className="text-zinc-500 dark:text-zinc-400 text-xs uppercase">
											Dead Letter Queue
										</span>
										{stats && (
											<span className="text-xs text-zinc-500 font-mono">
												{stats.dlq_count} message{stats.dlq_count !== 1 ? 's' : ''}
											</span>
										)}
									</div>
									{dlqMessages.length > 0 ? (
										<div className="space-y-2">
											{dlqMessages.map((msg) => (
												<div
													key={msg.id}
													className="bg-orange-50 dark:bg-orange-950/30 border border-orange-300 dark:border-orange-500/20 rounded-md p-2 flex items-center justify-between"
												>
													<div>
														<div className="text-xs font-mono text-orange-600 dark:text-orange-400">
															{msg.id}
														</div>
														{msg.failure_reason && (
															<div className="text-xs text-zinc-500 mt-0.5">
																{msg.failure_reason}
															</div>
														)}
													</div>
													<Button
														onClick={() => handleReplay(msg.id)}
														disabled={!!loading}
														variant="ghost"
														size="xs"
													>
														<RotateCcw className="size-3" />
														Replay
													</Button>
												</div>
											))}
										</div>
									) : (
										<p className="text-xs text-zinc-500 dark:text-zinc-600">
											No dead letters. Nack a message past max retries to see it here.
										</p>
									)}
								</div>
							</>
						)}
					</div>
				</div>

				{/* Right Panel — Event Log */}
				<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg overflow-hidden">
					<div className="px-4 py-3 flex justify-between items-center">
						<span className="text-zinc-900 dark:text-white font-medium text-sm">
							Event Log
						</span>
						{events.length > 0 && (
							<Badge variant="secondary" className="text-[10px]">
								{events.length} event{events.length !== 1 ? 's' : ''}
							</Badge>
						)}
					</div>
					<Separator />

					<div className="h-[400px] overflow-y-auto p-3 space-y-1.5">
						{events.length === 0 ? (
							<div className="text-zinc-500 dark:text-zinc-600 text-sm text-center py-8">
								{queueReady
									? 'Publish a message to start...'
									: 'Click "Setup Queue" to begin.'}
							</div>
						) : (
							events.map((evt) => (
								<div
									key={evt.id}
									className={`border rounded px-3 py-2 bg-zinc-100 dark:bg-zinc-950/50 ${getEventBorder(evt.action)}`}
								>
									<div className="flex items-center justify-between mb-0.5">
										<span
											className={`text-xs font-medium uppercase ${getEventColor(evt.action)}`}
										>
											{evt.action}
										</span>
										<span className="text-xs text-zinc-500 dark:text-zinc-600">
											{new Date(evt.timestamp).toLocaleTimeString()}
										</span>
									</div>
									<div className="text-sm text-zinc-700 dark:text-zinc-300">
										{evt.detail}
									</div>
									{evt.messageId && (
										<div className="text-xs font-mono text-zinc-500 dark:text-zinc-600 mt-0.5">
											{evt.messageId}
										</div>
									)}
								</div>
							))
						)}
						<div ref={eventsEndRef} />
					</div>
				</div>
			</div>

			{/* Callout Tip */}
			<div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg px-4 py-3">
				<p className="text-zinc-600 dark:text-zinc-400 text-xs">
					<span className="text-cyan-600 dark:text-cyan-400 font-medium">Tip:</span> Publish a
					message, then receive and nack it 2 times to move it to the Dead Letter Queue. Replay
					returns it to the main queue.
				</p>
			</div>
		</div>
	);
}
