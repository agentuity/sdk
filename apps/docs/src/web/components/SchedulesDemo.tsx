import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { usePersistentDemoState } from '../hooks/usePersistentDemoState';
import { Badge, Button, Separator } from './ui';

type DeliveryStatus = 'pending' | 'success' | 'failed';
type DemoStatus =
	| 'idle'
	| 'creating'
	| 'waiting'
	| 'delivered'
	| 'failed'
	| 'cleaned'
	| 'timed-out'
	| 'error';

interface ScheduleRecord {
	id: string;
	name: string;
	description: string | null;
	expression: string;
	due_date: string;
	created_at: string;
}

interface ScheduleDestination {
	id: string;
	type: 'url' | 'sandbox';
	config: Record<string, unknown>;
}

interface ScheduleDelivery {
	id: string;
	date: string;
	status: DeliveryStatus;
	retries: number;
	error: string | null;
	response: Record<string, unknown> | null;
}

interface ScheduleDemoPayload {
	schedule: ScheduleRecord;
	destinations: ScheduleDestination[];
	deliveries: ScheduleDelivery[];
	destinationUrl: string;
}

interface ScheduleDemoState {
	status: DemoStatus;
	cleanedUp: boolean;
	schedule: ScheduleRecord | null;
	destinations: ScheduleDestination[];
	deliveries: ScheduleDelivery[];
	destinationUrl: string;
	error: string | null;
}

interface ApiResponse<T> {
	success: boolean;
	message?: string;
	data?: T;
}

const DEFAULT_EXPRESSION = '* * * * *';
const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_ATTEMPTS = 18;
const TERMINAL_STATUSES = new Set<DemoStatus>([
	'delivered',
	'failed',
	'cleaned',
	'timed-out',
	'error',
]);
const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
	hour: 'numeric',
	minute: '2-digit',
	second: '2-digit',
});

const INITIAL_STATE: ScheduleDemoState = {
	status: 'idle',
	cleanedUp: true,
	schedule: null,
	destinations: [],
	deliveries: [],
	destinationUrl: '',
	error: null,
};

function formatTimestamp(isoDate: string | null | undefined): string {
	if (!isoDate) return '—';
	return TIME_FORMATTER.format(new Date(isoDate));
}

function formatCountdown(targetIsoDate: string | null | undefined, now: number): string {
	if (!targetIsoDate) return '—';
	const remainingMs = Date.parse(targetIsoDate) - now;
	if (Number.isNaN(remainingMs)) return '—';
	if (remainingMs <= 0) return 'any moment';
	const totalSeconds = Math.ceil(remainingMs / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes > 0) return `in ${minutes}m ${seconds}s`;
	return `in ${seconds}s`;
}

function getResponseStatusCode(response: Record<string, unknown> | null): number | null {
	const statusCode = response?.status_code;
	return typeof statusCode === 'number' ? statusCode : null;
}

function formatResponseBody(response: Record<string, unknown> | null): string | null {
	if (!response || !('body' in response)) return null;
	const body = response.body;
	if (typeof body === 'string') return body;
	if (body === null || body === undefined) return null;
	try {
		return JSON.stringify(body, null, 2);
	} catch {
		return String(body);
	}
}

function getPrimaryDestination(
	destinations: ReadonlyArray<ScheduleDestination>
): ScheduleDestination | null {
	return destinations[0] ?? null;
}

function getPrimaryDelivery(deliveries: ReadonlyArray<ScheduleDelivery>): ScheduleDelivery | null {
	return deliveries[0] ?? null;
}

function getDestinationPath(destinationUrl: string): string {
	const path = destinationUrl.replace(/^https?:\/\/[^/]+/u, '');
	return path || destinationUrl;
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
	const response = await fetch(`/api/schedules${path}`, options);
	const body = (await response.json().catch(() => null)) as ApiResponse<T> | null;

	if (!response.ok || !body?.success || body.data === undefined) {
		const message =
			body?.message ??
			(response.ok ? 'Unexpected schedules response.' : `HTTP ${response.status}`);
		throw new Error(message);
	}

	return body.data;
}

async function deleteSchedule(scheduleId: string): Promise<void> {
	const response = await fetch(`/api/schedules/${scheduleId}`, { method: 'DELETE' });
	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as ApiResponse<null> | null;
		throw new Error(body?.message ?? `HTTP ${response.status}`);
	}
}

export function SchedulesDemo() {
	const [demoState, setDemoState] = usePersistentDemoState<ScheduleDemoState>(
		'schedules',
		'state',
		{ defaultValue: INITIAL_STATE, storage: 'session', version: 3 }
	);
	const [isCleaning, setIsCleaning] = useState(false);
	const [now, setNow] = useState(() => Date.now());
	const pollTimeoutRef = useRef<number | null>(null);
	const abortControllerRef = useRef<AbortController | null>(null);
	const pollCountRef = useRef(0);
	const currentScheduleIdRef = useRef('');
	const demoStateRef = useRef(demoState);

	useEffect(() => {
		demoStateRef.current = demoState;
	}, [demoState]);

	const stopPolling = useCallback(() => {
		if (pollTimeoutRef.current !== null) {
			window.clearTimeout(pollTimeoutRef.current);
			pollTimeoutRef.current = null;
		}
		abortControllerRef.current?.abort();
		abortControllerRef.current = null;
		pollCountRef.current = 0;
		currentScheduleIdRef.current = '';
	}, []);

	const updateFromPayload = useCallback(
		(payload: ScheduleDemoPayload, status: DemoStatus, cleanedUp: boolean) => {
			setDemoState((previous) => ({
				...previous,
				status,
				cleanedUp,
				schedule: payload.schedule,
				destinations: payload.destinations,
				deliveries: payload.deliveries,
				destinationUrl: payload.destinationUrl,
				error: null,
			}));
		},
		[setDemoState]
	);

	const finalizeRun = useCallback(
		async (scheduleId: string, nextStatus: DemoStatus) => {
			stopPolling();
			setIsCleaning(true);

			try {
				await deleteSchedule(scheduleId);
				setDemoState((previous) => {
					if (previous.schedule?.id !== scheduleId) return previous;
					return { ...previous, status: nextStatus, cleanedUp: true, error: null };
				});
			} catch (error) {
				setDemoState((previous) => {
					if (previous.schedule?.id !== scheduleId) return previous;
					return {
						...previous,
						status: 'error',
						cleanedUp: false,
						error:
							error instanceof Error
								? `Cleanup failed: ${error.message}`
								: 'Cleanup failed for the demo schedule.',
					};
				});
			} finally {
				setIsCleaning(false);
			}
		},
		[setDemoState, stopPolling]
	);

	const pollSchedule = useCallback(
		async (scheduleId: string): Promise<void> => {
			pollCountRef.current += 1;
			if (pollCountRef.current > MAX_POLL_ATTEMPTS) {
				await finalizeRun(scheduleId, 'timed-out');
				return;
			}

			try {
				const controller = new AbortController();
				abortControllerRef.current = controller;
				const payload = await api<ScheduleDemoPayload>(`/${scheduleId}`, {
					signal: controller.signal,
				});
				if (currentScheduleIdRef.current !== scheduleId) return;

				const latestDelivery = getPrimaryDelivery(payload.deliveries);
				updateFromPayload(payload, 'waiting', false);

				if (latestDelivery?.status === 'success') {
					await finalizeRun(scheduleId, 'delivered');
					return;
				}

				if (latestDelivery?.status === 'failed') {
					await finalizeRun(scheduleId, 'failed');
					return;
				}

				pollTimeoutRef.current = window.setTimeout(() => {
					void pollSchedule(scheduleId);
				}, POLL_INTERVAL_MS);
			} catch (error) {
				if (error instanceof Error && error.name === 'AbortError') return;
				if (currentScheduleIdRef.current !== scheduleId) return;

				// Schedule reads can fail transiently even when the managed schedule still exists
				// Keep polling instead of turning a recoverable platform blip into a terminal UI error
				setDemoState((previous) => {
					if (previous.schedule?.id !== scheduleId) return previous;
					return {
						...previous,
						status: 'waiting',
						error: null,
					};
				});

				pollTimeoutRef.current = window.setTimeout(() => {
					void pollSchedule(scheduleId);
				}, POLL_INTERVAL_MS);
			}
		},
		[finalizeRun, setDemoState, updateFromPayload]
	);

	useEffect(() => {
		if (demoState.status !== 'waiting' || !demoState.schedule?.due_date) return;
		const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(intervalId);
	}, [demoState.status, demoState.schedule?.due_date]);

	useEffect(() => {
		return () => stopPolling();
	}, [stopPolling]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: only run once per mount
	useEffect(() => {
		const persistedScheduleId = demoState.schedule?.id;
		if (!persistedScheduleId) {
			if (demoState.status === 'error' || demoState.error) {
				setDemoState(INITIAL_STATE);
			}
			return;
		}

		if (demoState.cleanedUp) return;
		if (!TERMINAL_STATUSES.has(demoState.status)) {
			currentScheduleIdRef.current = persistedScheduleId;
			pollCountRef.current = 0;
			void pollSchedule(persistedScheduleId);
			return;
		}

		void (async () => {
			try {
				await deleteSchedule(persistedScheduleId);
			} catch {
				// Best-effort cleanup for schedules left over from a prior session.
			} finally {
				setDemoState(INITIAL_STATE);
			}
		})();
	}, []);

	const handleStart = useCallback(async () => {
		stopPolling();
		setDemoState({ ...INITIAL_STATE, status: 'creating', cleanedUp: true });

		try {
			const payload = await api<ScheduleDemoPayload>('', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ expression: DEFAULT_EXPRESSION }),
			});

			currentScheduleIdRef.current = payload.schedule.id;
			updateFromPayload(payload, 'waiting', false);
			void pollSchedule(payload.schedule.id);
		} catch (error) {
			setDemoState({
				...INITIAL_STATE,
				status: 'error',
				error: error instanceof Error ? error.message : 'Failed to create the schedule.',
			});
		}
	}, [pollSchedule, setDemoState, stopPolling, updateFromPayload]);

	const handleCleanupNow = useCallback(async () => {
		const activeScheduleId = demoStateRef.current.schedule?.id;
		if (!activeScheduleId) return;
		await finalizeRun(activeScheduleId, 'cleaned');
	}, [finalizeRun]);

	const handleReset = useCallback(() => {
		stopPolling();
		setDemoState(INITIAL_STATE);
	}, [setDemoState, stopPolling]);

	const isCreating = demoState.status === 'creating';
	const isWaiting = demoState.status === 'waiting';
	const isBusy = isCreating || isWaiting || isCleaning;
	const activeDestination = getPrimaryDestination(demoState.destinations);
	const latestDelivery = getPrimaryDelivery(demoState.deliveries);
	const responseStatusCode = getResponseStatusCode(latestDelivery?.response ?? null);
	const responseBody = formatResponseBody(latestDelivery?.response ?? null);

	const destinationLabel =
		activeDestination?.type === 'url'
			? String(activeDestination.config.url ?? demoState.destinationUrl)
			: demoState.destinationUrl || '/api/hello';
	const destinationPath = getDestinationPath(destinationLabel);

	const countdownLabel = useMemo(
		() => formatCountdown(demoState.schedule?.due_date, now),
		[demoState.schedule?.due_date, now]
	);

	const statusLabel = (() => {
		switch (demoState.status) {
			case 'creating':
				return 'Creating';
			case 'waiting':
				return `Waiting ${countdownLabel}`;
			case 'delivered':
				return 'Delivered';
			case 'failed':
				return 'Delivery failed';
			case 'cleaned':
				return 'Cleaned up';
			case 'timed-out':
				return 'Timed out';
			case 'error':
				return 'Error';
			default:
				return 'Ready';
		}
	})();

	const statusVariant: 'secondary' | 'success' | 'destructive' | 'outline' = (() => {
		switch (demoState.status) {
			case 'delivered':
				return 'success';
			case 'failed':
			case 'timed-out':
			case 'error':
				return 'destructive';
			case 'creating':
			case 'waiting':
				return 'secondary';
			default:
				return 'outline';
		}
	})();

	const showDetails = demoState.schedule !== null;
	const showDeliveryLine = latestDelivery !== null;
	const canCleanup = demoState.schedule !== null && !demoState.cleanedUp;
	const canReset =
		demoState.schedule !== null && demoState.cleanedUp && !isCreating && !isCleaning;
	const statusAnnouncement = (() => {
		if (demoState.error) return `Schedules demo error: ${demoState.error}`;
		if (latestDelivery?.status === 'success') {
			return `Schedule delivery succeeded at ${formatTimestamp(latestDelivery.date)}.`;
		}
		if (latestDelivery?.status === 'failed') {
			return `Schedule delivery failed at ${formatTimestamp(latestDelivery.date)}.`;
		}
		if (demoState.status === 'waiting') {
			return 'Waiting for the first schedule delivery.';
		}
		return `Schedules demo is ${statusLabel.toLowerCase()}.`;
	})();

	return (
		<div className="flex flex-col gap-4">
			<div className="sr-only" aria-live="polite" aria-atomic="true">
				{statusAnnouncement}
			</div>

			<div
				className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg overflow-hidden"
				aria-busy={isBusy}
			>
				<div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
					<Badge variant={statusVariant}>{statusLabel}</Badge>
					<div className="flex flex-wrap items-center gap-2">
						<Button
							onClick={handleStart}
							disabled={isBusy || !demoState.cleanedUp}
							variant="outline"
							size="sm"
							className="min-h-11 sm:min-h-9"
						>
							<span className="relative">
								<span className={isCreating ? 'invisible' : ''}>
									{demoState.schedule ? 'Run again' : 'Create schedule'}
								</span>
								{isCreating && (
									<span
										className="absolute inset-0 flex items-center justify-center"
										data-loading="true"
									/>
								)}
							</span>
						</Button>
						{canCleanup && (
							<Button
								onClick={() => void handleCleanupNow()}
								disabled={isCreating || isCleaning}
								variant="ghost"
								size="sm"
								className="min-h-11 sm:min-h-9"
							>
								Clean up
							</Button>
						)}
						{canReset && (
							<Button
								onClick={handleReset}
								variant="ghost"
								size="sm"
								className="min-h-11 sm:min-h-9"
							>
								Reset
							</Button>
						)}
					</div>
				</div>

				<Separator />

				{showDetails ? (
					<>
						<div className="px-4 py-4 grid gap-2">
							<Row
								label="Expression"
								value={
									<code className="text-cyan-800 dark:text-cyan-400 font-mono">
										{demoState.schedule?.expression ?? DEFAULT_EXPRESSION}
									</code>
								}
							/>
							<Row
								label="Destination"
								value={
									<code
										className="font-mono text-xs break-words [overflow-wrap:anywhere]"
										title={destinationLabel}
									>
										{destinationPath}
									</code>
								}
							/>
							{isWaiting && !showDeliveryLine && (
								<Row label="Next delivery" value={countdownLabel} />
							)}
							{showDeliveryLine && (
								<Row
									label="Fired"
									value={
										<span className="flex flex-wrap items-center gap-2">
											<Badge
												variant={
													latestDelivery?.status === 'success'
														? 'success'
														: latestDelivery?.status === 'failed'
															? 'destructive'
															: 'secondary'
												}
											>
												{latestDelivery?.status}
											</Badge>
											{responseStatusCode !== null && (
												<span className="text-zinc-600 dark:text-zinc-400 text-sm">
													HTTP {responseStatusCode}
												</span>
											)}
											<span className="text-zinc-500 text-xs">
												{formatTimestamp(latestDelivery?.date)}
											</span>
										</span>
									}
								/>
							)}
						</div>
						{responseBody && (
							<>
								<Separator />
								<div className="px-4 py-4 space-y-2">
									<div className="text-zinc-500 text-xs uppercase tracking-wide">
										Captured response
									</div>
									<pre
										dir="auto"
										className="bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200 font-mono whitespace-pre-wrap break-words [overflow-wrap:anywhere] m-0 max-h-48 overflow-auto"
									>
										{responseBody}
									</pre>
								</div>
							</>
						)}
						{latestDelivery?.error && (
							<>
								<Separator />
								<div className="px-4 py-3 text-sm text-red-600 dark:text-red-400">
									{latestDelivery.error}
								</div>
							</>
						)}
					</>
				) : (
					<div className="px-4 py-4 text-sm text-zinc-500 dark:text-zinc-400">
						Creates a schedule that calls{' '}
						<code className="text-cyan-800 dark:text-cyan-400 font-mono">/api/hello</code>{' '}
						once a minute and shows the first recorded delivery.
					</div>
				)}

				{demoState.error && (
					<>
						<Separator />
						<div
							className="px-4 py-2 bg-red-50 dark:bg-red-950/20 border-t border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 text-sm"
							role="status"
							aria-live="polite"
						>
							{demoState.error}
						</div>
					</>
				)}
			</div>
		</div>
	);
}

function Row({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[112px_minmax(0,1fr)] sm:gap-3 sm:items-baseline">
			<span className="text-zinc-500 text-xs uppercase tracking-wide">{label}</span>
			<span className="text-sm text-zinc-700 dark:text-zinc-300 min-w-0 break-words [overflow-wrap:anywhere]">
				{value}
			</span>
		</div>
	);
}
