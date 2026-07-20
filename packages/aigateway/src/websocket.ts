import { StructuredError } from '@agentuity/core';
import { resolveRegion, resolveServiceUrl, type Logger } from '@agentuity/client';
import { getEnv, getServiceUrls } from '@agentuity/config';
import { z } from 'zod';
import {
	AIGatewayWSFrameType,
	AIGatewayWSResponseStatus,
	buildAIGatewayWebSocketUrl,
	isCliApiKey,
	parseAIGatewayWSServerFrame,
	type AIGatewayWSUsage,
	type AIGatewayWSServerError,
	type AIGatewayWSServerResponse,
} from './protocol.ts';
import { getAIGatewayCompletionText, getAIGatewayStreamDeltaText } from './service.ts';

export const AIGatewayWebSocketErrorCode = {
	connection_error: 'connection_error',
	connection_draining: 'connection_draining',
	connection_closed: 'connection_closed',
	invalid_response: 'invalid_response',
	max_reconnects_exceeded: 'max_reconnects_exceeded',
	request_timeout: 'request_timeout',
} as const;

export type AIGatewayWebSocketErrorCode =
	(typeof AIGatewayWebSocketErrorCode)[keyof typeof AIGatewayWebSocketErrorCode];

export const AIGatewayWebSocketError = StructuredError('AIGatewayWebSocketError')<{
	code: AIGatewayWebSocketErrorCode;
	statusCode?: number;
	requestId?: string;
	closeCode?: number;
	closeReason?: string;
}>();

export type AIGatewayWebSocketErrorInstance = InstanceType<typeof AIGatewayWebSocketError>;

export type AIGatewayWebSocketState =
	| 'connecting'
	| 'connected'
	| 'reconnecting'
	| 'draining'
	| 'closed';

export const AIGatewayWSRequestOptionsSchema = z.object({
	id: z.string().optional(),
	compact: z.boolean().optional().default(true),
	model: z.string().optional(),
	prompt: z.string().optional(),
	system: z.string().optional(),
	thinking: z.union([z.boolean(), z.string()]).optional(),
	temperature: z.number().optional(),
	max_tokens: z.number().optional(),
	stream: z.boolean().optional(),
	data: z.record(z.string(), z.unknown()).optional(),
	/**
	 * Stable prompt-cache affinity key for this request (Hub/Genesis session id).
	 * Forwarded to Ion as `cache_key` / `X-Cache-Key` for cross-provider caching.
	 */
	cache_key: z.string().optional(),
	timeoutMs: z.number().optional(),
});

export type AIGatewayWSRequestOptions = z.infer<typeof AIGatewayWSRequestOptionsSchema>;

export interface AIGatewayWSResult {
	id: string;
	content?: string;
	usage?: AIGatewayWSUsage;
	cost?: number;
	unit?: string;
	inputQty?: number;
	outputQty?: number;
	statusCode?: number;
	data?: unknown;
}

export type AIGatewayWSStreamEvent =
	| { type: 'delta'; delta: string }
	| { type: 'thinking_delta'; thinking: string }
	| { type: 'event'; event: string; data: unknown }
	| { type: 'complete'; result: AIGatewayWSResult };

export interface AIGatewayWebSocketOptions {
	apiKey: string;
	orgId?: string;
	url?: string;
	/**
	 * Stable prompt-cache affinity for this WebSocket (prefer Hub/Genesis session id).
	 * Sent as `X-Cache-Key` on the upgrade so Ion can pin Fireworks/OpenAI/xAI/etc.
	 * caches across models for the same conversation.
	 */
	cacheKey?: string;
	autoReconnect?: boolean;
	reconnectDelayMs?: number;
	maxReconnectDelayMs?: number;
	maxReconnectAttempts?: number;
	defaultTimeoutMs?: number;
	/** Log outbound request and inbound response frames. Defaults to AGENTUITY_AIGATEWAY_WS_DEBUG. */
	debug?: boolean;
	logger?: Logger;
	onOpen?: () => void;
	onClose?: (code: number, reason: string) => void;
	onError?: (error: AIGatewayWebSocketErrorInstance) => void;
	onDraining?: (message: string) => void;
	onReconnect?: (attempt: number) => void;
	onStateChange?: (state: AIGatewayWebSocketState) => void;
}

interface PendingRequest {
	id: string;
	stream: boolean;
	resolve: (result: AIGatewayWSResult) => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
	push?: (event: AIGatewayWSStreamEvent) => void;
	accumulated: string;
	thinkingAccumulated: string;
}

interface WebSocketLane {
	ws: WebSocket;
	role: 'active' | 'retiring';
	requestIds: Set<string>;
}

const DEFAULT_RECONNECT_DELAY_MS = 500;
const DEFAULT_MAX_RECONNECT_DELAY_MS = 30_000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;
const DEFAULT_TIMEOUT_MS = 120_000;
const GOING_AWAY_CLOSE_CODE = 1001;

function normalizeOrgId(orgId: string | undefined): string | undefined {
	const trimmed = orgId?.trim();
	return trimmed ? trimmed : undefined;
}

function resolveOrgId(options: { orgId?: string; apiKey: string }): string | undefined {
	const resolved =
		normalizeOrgId(options.orgId) ??
		normalizeOrgId(getEnv('AGENTUITY_ORGID')) ??
		normalizeOrgId(getEnv('AGENTUITY_ORG_ID')) ??
		normalizeOrgId(getEnv('AGENTUITY_CLOUD_ORG_ID'));
	if (!resolved && isCliApiKey(options.apiKey)) {
		throw new AIGatewayWebSocketError({
			message:
				'Organization ID is required when using a CLI API key (ck_*). Provide orgId in options or set AGENTUITY_ORGID / AGENTUITY_ORG_ID / AGENTUITY_CLOUD_ORG_ID.',
			code: 'connection_error',
		});
	}
	return resolved;
}

function resolveWebSocketUrl(options: { url?: string }): string {
	const serviceUrls = getServiceUrls(resolveRegion());
	const baseUrl = resolveServiceUrl({
		url: options.url,
		envKey: 'AGENTUITY_AIGATEWAY_URL',
		fallback: serviceUrls.aigateway,
	});
	return buildAIGatewayWebSocketUrl(baseUrl);
}

function isTerminalCloseCode(code: number): boolean {
	if (code === GOING_AWAY_CLOSE_CODE) {
		return false;
	}
	return code >= 4000 && code < 5000;
}

function isTruthyEnv(value: string | undefined): boolean {
	if (!value) {
		return false;
	}
	const normalized = value.trim().toLowerCase();
	return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function resolveDebugEnabled(options: AIGatewayWebSocketOptions): boolean {
	if (options.debug !== undefined) {
		return options.debug;
	}
	return isTruthyEnv(getEnv('AGENTUITY_AIGATEWAY_WS_DEBUG'));
}

function createRequestId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildRequestFrame(
	options: AIGatewayWSRequestOptions,
	id: string
): Record<string, unknown> {
	const parsed = AIGatewayWSRequestOptionsSchema.parse(options);
	const compact =
		options.compact ?? (parsed.data === undefined ? (parsed.compact ?? true) : false);
	const frame: Record<string, unknown> = {
		type: AIGatewayWSFrameType.request,
		id,
		compact,
	};

	const applySharedFields = () => {
		if (parsed.model !== undefined) frame.model = parsed.model;
		if (parsed.thinking !== undefined) frame.thinking = parsed.thinking;
		if (parsed.temperature !== undefined) frame.temperature = parsed.temperature;
		if (parsed.max_tokens !== undefined) frame.max_tokens = parsed.max_tokens;
		if (parsed.stream !== undefined) frame.stream = parsed.stream;
	};

	if (compact) {
		applySharedFields();
		if (parsed.prompt !== undefined) frame.prompt = parsed.prompt;
		if (parsed.system !== undefined) frame.system = parsed.system;
	} else {
		applySharedFields();
		if (parsed.data !== undefined) frame.data = parsed.data;
	}
	if (parsed.cache_key !== undefined) {
		frame.cache_key = parsed.cache_key;
	}

	return frame;
}

/** @internal Exported for unit tests and SDK consumers building frames manually. */
export function buildAIGatewayWebSocketRequestFrame(
	options: AIGatewayWSRequestOptions,
	id: string
): Record<string, unknown> {
	return buildRequestFrame(options, id);
}

function mapCompleteResponse(response: AIGatewayWSServerResponse): AIGatewayWSResult {
	return {
		id: response.id,
		content: response.content,
		usage: response.usage,
		cost: response.cost,
		unit: response.unit,
		inputQty: response.input_qty,
		outputQty: response.output_qty,
		statusCode: response.status_code,
		data: response.data,
	};
}

function mapServerError(error: AIGatewayWSServerError): AIGatewayWebSocketErrorInstance {
	return new AIGatewayWebSocketError({
		message: error.message,
		code: 'connection_error',
		statusCode: error.status_code,
		requestId: error.id,
	});
}

export class AIGatewayWebSocketClient {
	readonly #options: Required<
		Pick<
			AIGatewayWebSocketOptions,
			| 'autoReconnect'
			| 'reconnectDelayMs'
			| 'maxReconnectDelayMs'
			| 'maxReconnectAttempts'
			| 'defaultTimeoutMs'
		>
	> &
		AIGatewayWebSocketOptions;

	readonly #apiKey: string;
	readonly #orgId: string | undefined;
	readonly #cacheKey: string | undefined;
	readonly #url: string;
	readonly #debugEnabled: boolean;

	#activeLane: WebSocketLane | null = null;
	#retiringLane: WebSocketLane | null = null;
	#state: AIGatewayWebSocketState = 'closed';
	#intentionallyClosed = false;
	#reconnectAttempts = 0;
	#reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	#connectPromise: Promise<void> | null = null;
	#connectResolve: (() => void) | null = null;
	#connectReject: ((error: Error) => void) | null = null;
	#pending = new Map<string, PendingRequest>();

	constructor(options: AIGatewayWebSocketOptions) {
		if (!options.apiKey) {
			throw new AIGatewayWebSocketError({
				message: 'API key is required',
				code: 'connection_error',
			});
		}
		this.#options = {
			...options,
			autoReconnect: options.autoReconnect ?? true,
			reconnectDelayMs: options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS,
			maxReconnectDelayMs: options.maxReconnectDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS,
			maxReconnectAttempts: options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS,
			defaultTimeoutMs: options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
		};
		this.#apiKey = options.apiKey;
		this.#orgId = resolveOrgId({ orgId: options.orgId, apiKey: options.apiKey });
		const trimmedCacheKey = options.cacheKey?.trim();
		this.#cacheKey = trimmedCacheKey ? trimmedCacheKey : undefined;
		this.#url = resolveWebSocketUrl(options);
		this.#debugEnabled = resolveDebugEnabled(options);
	}

	#logDebug(message: string, detail?: unknown): void {
		if (!this.#debugEnabled) {
			return;
		}
		if (this.#options.logger) {
			if (detail !== undefined) {
				this.#options.logger.debug(`[aigateway-ws] ${message}`, detail);
			} else {
				this.#options.logger.debug(`[aigateway-ws] ${message}`);
			}
		} else if (detail !== undefined) {
			console.log('[aigateway-ws]', message, detail);
		} else {
			console.log('[aigateway-ws]', message);
		}
	}

	get state(): AIGatewayWebSocketState {
		return this.#state;
	}

	get isDraining(): boolean {
		return this.#retiringLane !== null;
	}

	get url(): string {
		return this.#url;
	}

	get orgId(): string | undefined {
		return this.#orgId;
	}

	connect(): Promise<void> {
		if (this.#activeLane?.ws.readyState === WebSocket.OPEN) {
			return Promise.resolve();
		}
		if (this.#connectPromise) {
			return this.#connectPromise;
		}
		this.#intentionallyClosed = false;
		this.#connectPromise = new Promise<void>((resolve, reject) => {
			this.#connectResolve = resolve;
			this.#connectReject = reject;
			if (!this.#activeLane) {
				this.#beginActiveConnection();
			}
		});
		return this.#connectPromise;
	}

	close(code = 1000, reason = 'client closed'): void {
		this.#intentionallyClosed = true;
		this.#clearReconnectTimer();
		this.#rejectAllPending(
			new AIGatewayWebSocketError({
				message: reason || 'WebSocket closed by client',
				code: 'connection_closed',
				closeCode: code,
				closeReason: reason,
			})
		);
		for (const lane of [this.#activeLane, this.#retiringLane]) {
			if (!lane) {
				continue;
			}
			lane.ws.close(code, reason);
		}
		this.#activeLane = null;
		this.#retiringLane = null;
		this.#setState('closed');
		this.#finishConnect(
			new AIGatewayWebSocketError({
				message: reason || 'WebSocket closed by client',
				code: 'connection_closed',
				closeCode: code,
				closeReason: reason,
			})
		);
	}

	cancel(requestId: string): void {
		const lane = this.#findLaneForRequest(requestId);
		if (!lane) {
			return;
		}
		this.#sendJsonOnLane(lane, {
			type: AIGatewayWSFrameType.cancel,
			id: requestId,
		});
	}

	async complete(options: AIGatewayWSRequestOptions): Promise<AIGatewayWSResult> {
		const streamOptions = { ...options, stream: false };
		const events: AIGatewayWSStreamEvent[] = [];
		for await (const event of this.stream(streamOptions)) {
			events.push(event);
		}
		const completeEvent = events.find((event) => event.type === 'complete');
		if (!completeEvent) {
			throw new AIGatewayWebSocketError({
				message: 'Request completed without a final response frame',
				code: 'invalid_response',
				requestId: options.id,
			});
		}
		return completeEvent.result;
	}

	async *stream(options: AIGatewayWSRequestOptions): AsyncGenerator<AIGatewayWSStreamEvent> {
		this.#assertCanSendRequest();
		await this.connect();

		const id = options.id ?? createRequestId();
		const timeoutMs = options.timeoutMs ?? this.#options.defaultTimeoutMs;
		const queue: AIGatewayWSStreamEvent[] = [];
		let notify: (() => void) | null = null;
		let done = false;
		let streamError: Error | null = null;

		const pending: PendingRequest = {
			id,
			stream: true,
			accumulated: '',
			thinkingAccumulated: '',
			resolve: () => {},
			reject: (error) => {
				streamError = error;
				done = true;
				notify?.();
			},
			timeout: setTimeout(() => {
				try {
					this.cancel(id);
				} catch {
					// cancel can fail if socket is not OPEN; always reject
				}
				this.#rejectPending(
					id,
					new AIGatewayWebSocketError({
						message: `Request timed out after ${timeoutMs}ms`,
						code: 'request_timeout',
						requestId: id,
					})
				);
			}, timeoutMs),
			push: (event) => {
				queue.push(event);
				notify?.();
			},
		};

		this.#pending.set(id, pending);

		try {
			this.#sendJson(
				buildRequestFrame(
					{
						...options,
						id,
						// Prefer per-request override; default to the connection affinity key.
						cache_key: options.cache_key ?? this.#cacheKey,
					},
					id
				),
				id
			);

			while (!done || queue.length > 0) {
				if (queue.length === 0) {
					await new Promise<void>((resolve) => {
						notify = resolve;
					});
					notify = null;
					if (streamError) {
						throw streamError;
					}
					continue;
				}
				const event = queue.shift();
				if (!event) {
					continue;
				}
				yield event;
				if (event.type === 'complete') {
					done = true;
				}
			}
			if (streamError) {
				throw streamError;
			}
		} finally {
			clearTimeout(pending.timeout);
			this.#pending.delete(id);
			this.#clearRetiringLaneIfIdle();
		}
	}

	#assertCanSendRequest(): void {
		if (this.#intentionallyClosed) {
			throw new AIGatewayWebSocketError({
				message: 'WebSocket client is closed',
				code: 'connection_closed',
			});
		}
	}

	#beginActiveConnection(): void {
		if (this.#activeLane) {
			return;
		}

		this.#clearReconnectTimer();
		this.#setState(
			this.#reconnectAttempts > 0 || this.#retiringLane ? 'reconnecting' : 'connecting'
		);

		const ws = new WebSocket(this.#url, {
			headers: {
				Authorization: `Bearer ${this.#apiKey}`,
				...(this.#orgId ? { 'x-agentuity-orgid': this.#orgId } : {}),
				...(this.#cacheKey ? { 'X-Cache-Key': this.#cacheKey } : {}),
			},
		});
		const lane: WebSocketLane = {
			ws,
			role: 'active',
			requestIds: new Set(),
		};
		this.#activeLane = lane;
		this.#attachLaneHandlers(lane);
	}

	#attachLaneHandlers(lane: WebSocketLane): void {
		const { ws } = lane;

		ws.onopen = () => {
			if (!this.#isTrackedLane(lane)) {
				return;
			}
			if (lane.role === 'active') {
				this.#reconnectAttempts = 0;
				this.#setState('connected');
				this.#logDebug('connected', { url: this.#url, orgId: this.#orgId });
				this.#options.onOpen?.();
				this.#finishConnect();
			}
		};

		ws.onmessage = (event) => {
			if (!this.#isTrackedLane(lane)) {
				return;
			}
			this.#handleMessage(event.data, lane);
		};

		ws.onerror = () => {
			if (!this.#isTrackedLane(lane)) {
				return;
			}
			if (lane.role === 'active') {
				this.#options.onError?.(
					new AIGatewayWebSocketError({
						message: 'WebSocket connection error',
						code: 'connection_error',
					})
				);
			}
		};

		ws.onclose = (event: CloseEvent) => {
			if (!this.#isTrackedLane(lane)) {
				return;
			}
			this.#handleLaneClose(lane, event);
		};
	}

	#handleLaneClose(lane: WebSocketLane, event: CloseEvent): void {
		const terminalClose = isTerminalCloseCode(event.code);
		if (terminalClose) {
			this.#intentionallyClosed = true;
		}

		this.#options.onClose?.(event.code, event.reason);

		if (lane.role === 'retiring') {
			this.#retiringLane = null;
			this.#rejectLanePending(
				lane,
				new AIGatewayWebSocketError({
					message:
						event.reason ||
						'WebSocket closed during server drain before all in-flight requests completed',
					code: 'connection_closed',
					closeCode: event.code,
					closeReason: event.reason || undefined,
				})
			);
			if (this.#activeLane?.ws.readyState === WebSocket.OPEN) {
				this.#setState('connected');
			}
			return;
		}

		this.#activeLane = null;
		this.#rejectLanePending(
			lane,
			new AIGatewayWebSocketError({
				message: `WebSocket closed (code ${event.code})${event.reason ? `: ${event.reason}` : ''}`,
				code: 'connection_closed',
				closeCode: event.code,
				closeReason: event.reason || undefined,
			})
		);

		this.#finishConnect(
			new AIGatewayWebSocketError({
				message: `WebSocket closed before connection was ready (code ${event.code})`,
				code: 'connection_error',
				closeCode: event.code,
				closeReason: event.reason || undefined,
			})
		);

		if (!this.#intentionallyClosed && this.#options.autoReconnect) {
			this.#scheduleReconnect();
		} else if (!this.#activeLane && !this.#retiringLane) {
			this.#setState('closed');
		}
	}

	#handleDraining(message: string, lane: WebSocketLane): void {
		if (lane.role !== 'active') {
			return;
		}

		this.#options.onDraining?.(message);

		if (this.#activeLane !== lane) {
			return;
		}

		lane.role = 'retiring';
		this.#retiringLane = lane;
		this.#activeLane = null;
		this.#setState('reconnecting');

		this.#options.onReconnect?.(1);
		this.#beginActiveConnection();
	}

	#handleMessage(raw: unknown, lane: WebSocketLane): void {
		this.#logDebug('recv raw', raw);
		let parsed: unknown;
		try {
			parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
		} catch {
			this.#options.onError?.(
				new AIGatewayWebSocketError({
					message: 'Received invalid JSON from AI Gateway WebSocket',
					code: 'invalid_response',
				})
			);
			return;
		}

		const frame = parseAIGatewayWSServerFrame(parsed);
		if (!frame) {
			this.#options.onError?.(
				new AIGatewayWebSocketError({
					message: 'Received unrecognized WebSocket frame',
					code: 'invalid_response',
				})
			);
			return;
		}

		if (frame.type === AIGatewayWSFrameType.draining) {
			this.#logDebug('recv draining', frame);
			this.#handleDraining(frame.message ?? 'server is draining', lane);
			return;
		}

		if (frame.type === AIGatewayWSFrameType.error) {
			this.#logDebug('recv error', frame);
			this.#handleErrorFrame(frame);
			return;
		}

		this.#logDebug('recv', frame);
		this.#handleResponseFrame(frame);
	}

	#handleErrorFrame(error: AIGatewayWSServerError): void {
		const mapped = mapServerError(error);
		if (error.id) {
			this.#rejectPending(error.id, mapped);
			return;
		}
		this.#options.onError?.(mapped);
	}

	#handleResponseFrame(response: AIGatewayWSServerResponse): void {
		const pending = this.#pending.get(response.id);
		if (!pending) {
			return;
		}

		if (response.status === AIGatewayWSResponseStatus.delta) {
			// Full-mode (compact: false) provider-native frames carry payload in `data`,
			// not top-level `delta`. Passthrough the native chunk only — Hub rehydrates
			// provider SSE from `event` frames; also emitting extracted `delta` duplicates text.
			if (response.data !== undefined && response.delta === undefined) {
				const extracted = getAIGatewayStreamDeltaText(response.data);
				if (extracted) {
					pending.accumulated += extracted;
				}
				pending.push?.({
					type: 'event',
					event: response.event ?? 'data',
					data: response.data,
				});
				return;
			}

			const delta = response.delta ?? '';
			pending.accumulated += delta;
			pending.push?.({ type: 'delta', delta });
			return;
		}

		if (response.status === AIGatewayWSResponseStatus.thinkingDelta) {
			const thinking = response.thinking ?? '';
			pending.thinkingAccumulated += thinking;
			pending.push?.({ type: 'thinking_delta', thinking });
			return;
		}

		if (response.event) {
			pending.push?.({
				type: 'event',
				event: response.event,
				data: response.data,
			});
		}

		if (response.status === AIGatewayWSResponseStatus.complete) {
			const content =
				response.content ?? (pending.accumulated || getAIGatewayCompletionText(response.data));
			const result = mapCompleteResponse({
				...response,
				content: content || undefined,
			});
			clearTimeout(pending.timeout);
			this.#pending.delete(response.id);
			this.#removeRequestFromLanes(response.id);
			pending.push?.({ type: 'complete', result });
			pending.resolve(result);
			this.#clearRetiringLaneIfIdle();
		}
	}

	#rejectPending(id: string, error: Error): void {
		const pending = this.#pending.get(id);
		if (!pending) {
			return;
		}
		clearTimeout(pending.timeout);
		this.#pending.delete(id);
		this.#removeRequestFromLanes(id);
		pending.reject(error);
		this.#clearRetiringLaneIfIdle();
	}

	#rejectLanePending(lane: WebSocketLane, error: AIGatewayWebSocketErrorInstance): void {
		for (const id of [...lane.requestIds]) {
			if (this.#pending.has(id)) {
				this.#rejectPending(id, error);
			}
		}
		lane.requestIds.clear();
	}

	#rejectAllPending(error: AIGatewayWebSocketErrorInstance): void {
		for (const id of [...this.#pending.keys()]) {
			this.#rejectPending(id, error);
		}
	}

	#removeRequestFromLanes(requestId: string): void {
		this.#activeLane?.requestIds.delete(requestId);
		this.#retiringLane?.requestIds.delete(requestId);
	}

	#findLaneForRequest(requestId: string): WebSocketLane | null {
		if (this.#activeLane?.requestIds.has(requestId)) {
			return this.#activeLane;
		}
		if (this.#retiringLane?.requestIds.has(requestId)) {
			return this.#retiringLane;
		}
		return null;
	}

	#clearRetiringLaneIfIdle(): void {
		if (!this.#retiringLane || this.#retiringLane.requestIds.size > 0) {
			return;
		}
		const ws = this.#retiringLane.ws;
		if (ws.readyState !== WebSocket.CLOSED) {
			ws.close(1000, 'lane idle');
		}
		this.#retiringLane = null;
	}

	#isTrackedLane(lane: WebSocketLane): boolean {
		return this.#activeLane === lane || this.#retiringLane === lane;
	}

	#scheduleReconnect(): void {
		if (this.#intentionallyClosed || !this.#options.autoReconnect || this.#activeLane) {
			return;
		}
		if (this.#reconnectAttempts >= this.#options.maxReconnectAttempts) {
			this.#options.onError?.(
				new AIGatewayWebSocketError({
					message: `Exceeded maximum reconnection attempts (${this.#options.maxReconnectAttempts})`,
					code: 'max_reconnects_exceeded',
				})
			);
			return;
		}

		const baseDelay = this.#options.reconnectDelayMs * 2 ** this.#reconnectAttempts;
		const jitter = 0.5 + Math.random() * 0.5;
		const delay = Math.min(Math.floor(baseDelay * jitter), this.#options.maxReconnectDelayMs);
		this.#reconnectAttempts += 1;
		this.#options.onReconnect?.(this.#reconnectAttempts);
		this.#reconnectTimer = setTimeout(() => {
			this.#reconnectTimer = null;
			this.#beginActiveConnection();
		}, delay);
	}

	#clearReconnectTimer(): void {
		if (this.#reconnectTimer) {
			clearTimeout(this.#reconnectTimer);
			this.#reconnectTimer = null;
		}
	}

	#sendJson(payload: Record<string, unknown>, requestId: string): void {
		const lane = this.#activeLane;
		if (!lane || lane.ws.readyState !== WebSocket.OPEN) {
			throw new AIGatewayWebSocketError({
				message: 'WebSocket is not connected',
				code: 'connection_error',
			});
		}
		lane.requestIds.add(requestId);
		this.#sendJsonOnLane(lane, payload);
	}

	#sendJsonOnLane(lane: WebSocketLane, payload: Record<string, unknown>): void {
		if (lane.ws.readyState !== WebSocket.OPEN) {
			throw new AIGatewayWebSocketError({
				message: 'WebSocket is not connected',
				code: 'connection_error',
			});
		}
		this.#logDebug('send', payload);
		lane.ws.send(JSON.stringify(payload));
	}

	#setState(state: AIGatewayWebSocketState): void {
		if (this.#state === state) {
			return;
		}
		this.#state = state;
		this.#options.onStateChange?.(state);
	}

	#finishConnect(error?: AIGatewayWebSocketErrorInstance): void {
		if (!this.#connectPromise) {
			return;
		}
		if (error && this.#state !== 'connected') {
			this.#connectReject?.(error);
		} else {
			this.#connectResolve?.();
		}
		this.#connectPromise = null;
		this.#connectResolve = null;
		this.#connectReject = null;
	}
}

export function createAIGatewayWebSocketClient(
	options: AIGatewayWebSocketOptions
): AIGatewayWebSocketClient {
	return new AIGatewayWebSocketClient(options);
}
