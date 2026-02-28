import type { Theme } from '@mariozechner/pi-coding-agent';
import { matchesKey } from '@mariozechner/pi-tui';
import { truncateToWidth } from './renderers.ts';

interface Component {
	render(width: number): string[];
	handleInput?(data: string): void;
	invalidate(): void;
}

interface Focusable {
	focused: boolean;
}

interface TUIRef {
	requestRender(): void;
}

interface HubSessionSummary {
	sessionId: string;
	label?: string;
	status: string;
	mode: string;
	observerCount: number;
	subAgentCount: number;
	taskCount: number;
	participantCount: number;
	createdAt: string;
}

interface HubParticipant {
	id: string;
	role: string;
	transport?: string;
	connectedAt?: string;
	idle?: boolean;
}

interface HubTask {
	taskId: string;
	agent: string;
	status: string;
	prompt?: string;
	duration?: number;
	startedAt?: string;
	completedAt?: string;
}

type AgentActivity = Record<
	string,
	{
		status?: string;
		currentTool?: string;
		toolCallCount?: number;
		lastActivity?: string;
	}
>;

interface HubSessionDetail {
	sessionId: string;
	label?: string;
	status: string;
	createdAt: string;
	mode: string;
	context?: {
		branch?: string;
		workingDirectory?: string;
	};
	participants?: HubParticipant[];
	tasks?: HubTask[];
	agentActivity?: AgentActivity;
}

interface HubListResponse {
	sessions?: {
		websocket?: HubSessionSummary[];
	};
}

interface FeedEntry {
	at: number;
	text: string;
}

interface SessionDigest {
	status: string;
	taskCount: number;
	observerCount: number;
	subAgentCount: number;
}

interface HubOverlayOptions {
	baseUrl: string;
	currentSessionId?: string;
	initialSessionId?: string;
	startInDetail?: boolean;
	done: (result: undefined) => void;
}

type ScreenMode = 'list' | 'detail';

const ANSI_RE = /\x1b\[[0-9;]*m/g;
const POLL_MS = 4_000;
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_FEED_ITEMS = 80;
const STREAM_SESSION_LIMIT = 8;

function visibleWidth(text: string): number {
	return text.replace(ANSI_RE, '').length;
}

function padRight(text: string, width: number): string {
	if (width <= 0) return '';
	const truncated = truncateToWidth(text, width);
	const remaining = width - visibleWidth(truncated);
	return remaining > 0 ? truncated + ' '.repeat(remaining) : truncated;
}

function hLine(width: number): string {
	return width > 0 ? '─'.repeat(width) : '';
}

function buildTopBorder(width: number, title: string): string {
	if (width <= 0) return '';
	if (width === 1) return '╭';
	if (width === 2) return '╭╮';

	const inner = width - 2;
	const titleText = ` ${title} `;
	if (titleText.length >= inner) return `╭${hLine(inner)}╮`;

	const left = Math.floor((inner - titleText.length) / 2);
	const right = inner - titleText.length - left;
	return `╭${hLine(left)}${titleText}${hLine(right)}╮`;
}

function buildBottomBorder(width: number): string {
	if (width <= 0) return '';
	if (width === 1) return '╰';
	if (width === 2) return '╰╯';
	return `╰${hLine(width - 2)}╯`;
}

function formatClock(ms: number): string {
	const d = new Date(ms);
	return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatRelative(isoDate: string): string {
	const ts = Date.parse(isoDate);
	if (Number.isNaN(ts)) return '-';
	const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

function shortId(id: string): string {
	if (id.length <= 12) return id;
	return id.slice(0, 12);
}

function getVisibleRange(total: number, selected: number, windowSize: number): [number, number] {
	if (total <= windowSize) return [0, total];
	const half = Math.floor(windowSize / 2);
	let start = Math.max(0, selected - half);
	let end = start + windowSize;
	if (end > total) {
		end = total;
		start = end - windowSize;
	}
	return [start, end];
}

export class HubOverlay implements Component, Focusable {
	public focused = true;

	private readonly tui: TUIRef;
	private readonly theme: Theme;
	private readonly done: (result: undefined) => void;
	private readonly baseUrl: string;
	private readonly currentSessionId?: string;

	private screen: ScreenMode;
	private selectedIndex = 0;
	private detailSessionId: string | null;
	private detailScrollOffset = 0;
	private detailMaxScroll = 0;
	private feedExpanded = false;

	private sessions: HubSessionSummary[] = [];
	private detail: HubSessionDetail | null = null;
	private feed: FeedEntry[] = [];
	private previousDigests = new Map<string, SessionDigest>();

	private loadingList = true;
	private loadingDetail = false;
	private listError = '';
	private detailError = '';
	private lastUpdatedAt = 0;
	private listInFlight = false;
	private detailInFlight = false;
	private sseControllers = new Map<string, AbortController>();

	private disposed = false;
	private pollTimer: ReturnType<typeof setInterval> | null = null;

	constructor(tui: TUIRef, theme: Theme, options: HubOverlayOptions) {
		this.tui = tui;
		this.theme = theme;
		this.done = options.done;
		this.baseUrl = options.baseUrl;
		this.currentSessionId = options.currentSessionId;
		this.detailSessionId = options.initialSessionId ?? null;
		this.screen = options.startInDetail && options.initialSessionId ? 'detail' : 'list';

		void this.refreshList(true);
		if (this.detailSessionId) {
			void this.refreshDetail(this.detailSessionId, true);
		}

		this.pollTimer = setInterval(() => {
			if (this.disposed) return;
			void this.refreshList();
			if (this.detailSessionId) {
				void this.refreshDetail(this.detailSessionId);
			}
		}, POLL_MS);
	}

	handleInput(data: string): void {
		if (this.disposed) return;

		if (matchesKey(data, 'escape')) {
			if (this.screen === 'detail') {
				this.screen = 'list';
				this.requestRender();
				return;
			}
			this.close();
			return;
		}

		if (matchesKey(data, 'r') || data.toLowerCase() === 'r') {
			void this.refreshList();
			if (this.screen === 'detail' && this.detailSessionId) {
				void this.refreshDetail(this.detailSessionId);
			}
			return;
		}

		if (matchesKey(data, 'f') || data.toLowerCase() === 'f') {
			this.feedExpanded = !this.feedExpanded;
			this.requestRender();
			return;
		}

		if (this.screen === 'list') {
			this.handleListInput(data);
			return;
		}

		this.handleDetailInput(data);
	}

	render(width: number): string[] {
		const safeWidth = Math.max(6, width);
		const termHeight = process.stdout.rows || 40;
		const maxLines = Math.max(12, Math.floor(termHeight * 0.95) - 2);

		const lines = this.screen === 'detail'
			? this.renderDetailScreen(safeWidth, maxLines)
			: this.renderListScreen(safeWidth, maxLines);
		return lines.map((line) => truncateToWidth(line, safeWidth));
	}

	invalidate(): void {
		this.requestRender();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
		for (const controller of this.sseControllers.values()) {
			controller.abort();
		}
		this.sseControllers.clear();
	}

	private requestRender(): void {
		try {
			this.tui.requestRender();
		} catch {
			// Best effort render invalidation.
		}
	}

	private close(): void {
		this.dispose();
		this.done(undefined);
	}

	private handleListInput(data: string): void {
		const count = this.sessions.length;

		if (matchesKey(data, 'up') || data.toLowerCase() === 'k') {
			if (count > 0) {
				this.selectedIndex = (this.selectedIndex - 1 + count) % count;
				this.requestRender();
			}
			return;
		}

		if (matchesKey(data, 'down') || data.toLowerCase() === 'j') {
			if (count > 0) {
				this.selectedIndex = (this.selectedIndex + 1) % count;
				this.requestRender();
			}
			return;
		}

		if (matchesKey(data, 'enter')) {
			const selected = this.sessions[this.selectedIndex];
			if (!selected) return;
			this.detailSessionId = selected.sessionId;
			this.detailScrollOffset = 0;
			this.screen = 'detail';
			void this.refreshDetail(selected.sessionId, true);
			this.requestRender();
		}
	}

	private handleDetailInput(data: string): void {
		if (matchesKey(data, 'up') || data.toLowerCase() === 'k') {
			if (this.detailScrollOffset > 0) {
				this.detailScrollOffset -= 1;
				this.requestRender();
			}
			return;
		}

		if (matchesKey(data, 'down') || data.toLowerCase() === 'j') {
			if (this.detailScrollOffset < this.detailMaxScroll) {
				this.detailScrollOffset += 1;
				this.requestRender();
			}
			return;
		}

		if (matchesKey(data, 'pageUp') || matchesKey(data, 'shift+up')) {
			const jump = Math.max(1, Math.floor((process.stdout.rows || 40) / 3));
			this.detailScrollOffset = Math.max(0, this.detailScrollOffset - jump);
			this.requestRender();
			return;
		}

		if (matchesKey(data, 'pageDown') || matchesKey(data, 'shift+down')) {
			const jump = Math.max(1, Math.floor((process.stdout.rows || 40) / 3));
			this.detailScrollOffset = Math.min(this.detailMaxScroll, this.detailScrollOffset + jump);
			this.requestRender();
		}
	}

	private async fetchJson<T>(path: string): Promise<T> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
		try {
			const response = await fetch(`${this.baseUrl}${path}`, {
				headers: { accept: 'application/json' },
				signal: controller.signal,
			});
			if (!response.ok) {
				throw new Error(`Hub returned ${response.status}`);
			}
			return (await response.json()) as T;
		} finally {
			clearTimeout(timeout);
		}
	}

	private async refreshList(initial = false): Promise<void> {
		if (this.disposed || this.listInFlight) return;
		this.listInFlight = true;
		if (initial) {
			this.loadingList = true;
			this.listError = '';
			this.requestRender();
		}

		try {
			const data = await this.fetchJson<HubListResponse>('/api/hub/sessions');
			const sessions = (data.sessions?.websocket ?? []).slice().sort((a, b) => {
				return Date.parse(b.createdAt) - Date.parse(a.createdAt);
			});

			this.updateFeedFromList(sessions);
			this.sessions = sessions;
			if (this.selectedIndex >= this.sessions.length) {
				this.selectedIndex = Math.max(0, this.sessions.length - 1);
			}
			this.loadingList = false;
			this.listError = '';
			this.lastUpdatedAt = Date.now();
			void this.syncSseStreams(this.sessions);
			this.requestRender();
		} catch (err) {
			this.loadingList = false;
			this.listError = err instanceof Error ? err.message : String(err);
			this.requestRender();
		} finally {
			this.listInFlight = false;
		}
	}

	private async refreshDetail(sessionId: string, initial = false): Promise<void> {
		if (this.disposed || this.detailInFlight) return;
		this.detailInFlight = true;
		if (initial) {
			this.loadingDetail = true;
			this.detailError = '';
			this.requestRender();
		}

		try {
			const detail = await this.fetchJson<HubSessionDetail>(
				`/api/hub/session/${encodeURIComponent(sessionId)}`,
			);
			this.detail = detail;
			this.detailSessionId = sessionId;
			this.loadingDetail = false;
			this.detailError = '';
			this.lastUpdatedAt = Date.now();
			this.requestRender();
		} catch (err) {
			this.loadingDetail = false;
			this.detailError = err instanceof Error ? err.message : String(err);
			this.requestRender();
		} finally {
			this.detailInFlight = false;
		}
	}

	private updateFeedFromList(sessions: HubSessionSummary[]): void {
		if (this.previousDigests.size === 0) {
			if (sessions.length > 0) {
				this.pushFeed(`Loaded ${sessions.length} active session${sessions.length === 1 ? '' : 's'}`);
			}
			for (const session of sessions) {
				this.previousDigests.set(session.sessionId, {
					status: session.status,
					taskCount: session.taskCount,
					observerCount: session.observerCount,
					subAgentCount: session.subAgentCount,
				});
			}
			return;
		}

		const nextDigests = new Map<string, SessionDigest>();
		for (const session of sessions) {
			const prev = this.previousDigests.get(session.sessionId);
			const label = session.label || shortId(session.sessionId);

			if (!prev) {
				this.pushFeed(`${label}: session discovered (${session.mode})`);
			} else {
				if (prev.status !== session.status) {
					this.pushFeed(`${label}: ${prev.status} -> ${session.status}`);
				}
				if (session.taskCount > prev.taskCount) {
					const delta = session.taskCount - prev.taskCount;
					this.pushFeed(`${label}: +${delta} task${delta === 1 ? '' : 's'}`);
				}
				if (session.observerCount !== prev.observerCount) {
					this.pushFeed(`${label}: observers ${prev.observerCount} -> ${session.observerCount}`);
				}
				if (session.subAgentCount !== prev.subAgentCount) {
					this.pushFeed(`${label}: agents ${prev.subAgentCount} -> ${session.subAgentCount}`);
				}
			}

			nextDigests.set(session.sessionId, {
				status: session.status,
				taskCount: session.taskCount,
				observerCount: session.observerCount,
				subAgentCount: session.subAgentCount,
			});
		}

		for (const oldSessionId of this.previousDigests.keys()) {
			if (!nextDigests.has(oldSessionId)) {
				this.pushFeed(`${shortId(oldSessionId)}: session removed`);
			}
		}

		this.previousDigests = nextDigests;
	}

	private async syncSseStreams(sessions: HubSessionSummary[]): Promise<void> {
		if (this.disposed) return;
		const desired = new Set<string>(
			sessions.slice(0, STREAM_SESSION_LIMIT).map((session) => session.sessionId),
		);
		if (this.detailSessionId) desired.add(this.detailSessionId);

		for (const [sessionId, controller] of this.sseControllers) {
			if (!desired.has(sessionId)) {
				controller.abort();
				this.sseControllers.delete(sessionId);
			}
		}

		for (const sessionId of desired) {
			if (!this.sseControllers.has(sessionId)) {
				void this.startSseStream(sessionId);
			}
		}
	}

	private async startSseStream(sessionId: string): Promise<void> {
		if (this.disposed) return;
		if (this.sseControllers.has(sessionId)) return;

		const controller = new AbortController();
		this.sseControllers.set(sessionId, controller);

		try {
			const response = await fetch(
				`${this.baseUrl}/api/hub/session/${encodeURIComponent(sessionId)}/events?subscribe=session_*,task_*,agent_*`,
				{
					headers: { accept: 'text/event-stream' },
					signal: controller.signal,
				},
			);

			if (!response.ok || !response.body) {
				throw new Error(`Hub returned ${response.status} for stream`);
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				buffer = this.consumeSseBuffer(sessionId, buffer);
			}
		} catch (err) {
			if (controller.signal.aborted || this.disposed) return;
			const label = this.getSessionLabel(sessionId);
			const msg = err instanceof Error ? err.message : String(err);
			this.pushFeed(`${label}: stream error (${msg})`);
			this.requestRender();
		} finally {
			if (this.sseControllers.get(sessionId) === controller) {
				this.sseControllers.delete(sessionId);
			}
		}
	}

	private consumeSseBuffer(sessionId: string, rawBuffer: string): string {
		const normalized = rawBuffer.replace(/\r\n/g, '\n');
		let cursor = 0;

		while (true) {
			const boundary = normalized.indexOf('\n\n', cursor);
			if (boundary === -1) break;

			const block = normalized.slice(cursor, boundary);
			cursor = boundary + 2;
			if (!block.trim()) continue;

			let eventName = 'message';
			const dataLines: string[] = [];
			for (const line of block.split('\n')) {
				if (line.startsWith('event:')) {
					eventName = line.slice(6).trim() || eventName;
				} else if (line.startsWith('data:')) {
					dataLines.push(line.slice(5).trimStart());
				}
			}
			const dataText = dataLines.join('\n');
			this.handleSseEvent(sessionId, eventName, dataText);
		}

		return normalized.slice(cursor);
	}

	private handleSseEvent(sessionId: string, sseEvent: string, dataText: string): void {
		let payload: unknown = undefined;
		if (dataText) {
			try {
				payload = JSON.parse(dataText);
			} catch {
				payload = dataText;
			}
		}

		let eventName = sseEvent;
		let eventData: unknown = payload;
		if (payload && typeof payload === 'object') {
			const record = payload as Record<string, unknown>;
			if (typeof record.event === 'string') {
				eventName = record.event;
				eventData = record.data;
			}
		}

		if (eventName === 'snapshot' || eventName === 'hydration' || eventName === 'presence') {
			return;
		}

		const text = this.formatEventFeedLine(sessionId, eventName, eventData);
		if (text) {
			this.pushFeed(text);
			this.requestRender();
		}

		if (
			this.detailSessionId === sessionId &&
			(
				eventName === 'session_join' ||
				eventName === 'session_leave' ||
				eventName === 'task_start' ||
				eventName === 'task_complete' ||
				eventName === 'task_error' ||
				eventName === 'session_shutdown'
			)
		) {
			void this.refreshDetail(sessionId);
		}

		if (eventName === 'session_shutdown') {
			const controller = this.sseControllers.get(sessionId);
			if (controller) {
				controller.abort();
				this.sseControllers.delete(sessionId);
			}
		}
	}

	private formatEventFeedLine(sessionId: string, eventName: string, eventData: unknown): string | null {
		const label = this.getSessionLabel(sessionId);
		const data = eventData && typeof eventData === 'object'
			? eventData as Record<string, unknown>
			: undefined;

		if (eventName === 'task_start') {
			const taskId = typeof data?.taskId === 'string' ? shortId(data.taskId) : 'task';
			const agent = typeof data?.agent === 'string' ? data.agent : 'agent';
			return `${label}: ${taskId} started (${agent})`;
		}
		if (eventName === 'task_complete') {
			const taskId = typeof data?.taskId === 'string' ? shortId(data.taskId) : 'task';
			const duration = typeof data?.duration === 'number' ? ` ${data.duration}ms` : '';
			return `${label}: ${taskId} completed${duration}`;
		}
		if (eventName === 'task_error') {
			const taskId = typeof data?.taskId === 'string' ? shortId(data.taskId) : 'task';
			return `${label}: ${taskId} failed`;
		}
		if (eventName === 'session_join' || eventName === 'session_leave') {
			const participant = data?.participant as Record<string, unknown> | undefined;
			const role = typeof participant?.role === 'string' ? participant.role : 'participant';
			return `${label}: ${role} ${eventName === 'session_join' ? 'joined' : 'left'}`;
		}
		if (eventName === 'agent_start' || eventName === 'agent_end') {
			const agent = typeof data?.agentName === 'string'
				? data.agentName
				: typeof data?.agent === 'string'
					? data.agent
					: 'agent';
			return `${label}: ${agent} ${eventName === 'agent_start' ? 'started' : 'ended'}`;
		}
		if (eventName === 'session_complete' || eventName === 'session_error' || eventName === 'session_shutdown') {
			return `${label}: ${eventName}`;
		}

		return `${label}: ${eventName}`;
	}

	private getSessionLabel(sessionId: string): string {
		const session = this.sessions.find((item) => item.sessionId === sessionId);
		return session?.label || shortId(sessionId);
	}

	private pushFeed(text: string): void {
		this.feed.unshift({ at: Date.now(), text });
		if (this.feed.length > MAX_FEED_ITEMS) {
			this.feed.length = MAX_FEED_ITEMS;
		}
	}

	private renderListScreen(width: number, maxLines: number): string[] {
		const inner = Math.max(0, width - 2);
		const lines: string[] = [];
		const fixed = 8;
		const bodyBudget = Math.max(6, maxLines - fixed);
		const sessionBudget = Math.max(3, Math.floor(bodyBudget * (this.feedExpanded ? 0.45 : 0.65)));
		const feedBudget = Math.max(2, bodyBudget - sessionBudget);

		lines.push(buildTopBorder(width, 'Coder Hub'));
		lines.push(this.contentLine('', inner));

		if (this.loadingList) {
			lines.push(this.contentLine(this.theme.fg('dim', '  Loading sessions...'), inner));
		} else if (this.listError) {
			lines.push(this.contentLine(this.theme.fg('error', `  ${this.listError}`), inner));
		} else {
			const updated = this.lastUpdatedAt ? `${formatClock(this.lastUpdatedAt)} updated` : 'not updated';
			lines.push(this.contentLine(this.theme.fg('muted', `  Sessions: ${this.sessions.length}  ${updated}`), inner));
		}

		lines.push(this.contentLine(this.theme.fg('dim', `  ${hLine(Math.max(0, inner - 2))}`), inner));

		if (this.sessions.length === 0 && !this.loadingList && !this.listError) {
			lines.push(this.contentLine(this.theme.fg('muted', '  No active Hub sessions'), inner));
			for (let i = 1; i < sessionBudget; i++) lines.push(this.contentLine('', inner));
		} else {
			const [start, end] = getVisibleRange(this.sessions.length, this.selectedIndex, sessionBudget);
			if (start > 0) {
				lines.push(this.contentLine(this.theme.fg('dim', `  ↑ ${start} more above`), inner));
			}
			for (let i = start; i < end; i++) {
				const session = this.sessions[i]!;
				const selected = i === this.selectedIndex;
				const prefix = selected ? this.theme.fg('accent', '› ') : '  ';
				const label = session.label || shortId(session.sessionId);
				const self = this.currentSessionId === session.sessionId ? this.theme.fg('accent', ' (this)') : '';
				const status = this.theme.fg('dim', `${session.status} ${session.mode}`);
				const counts = this.theme.fg(
					'muted',
					` [${session.observerCount} watching] ${session.subAgentCount} agents ${session.taskCount} tasks`,
				);
				lines.push(this.contentLine(`${prefix}${this.theme.bold(label)}${self}  ${status}${counts}`, inner));
			}
			if (end < this.sessions.length) {
				lines.push(this.contentLine(this.theme.fg('dim', `  ↓ ${this.sessions.length - end} more below`), inner));
			}
			while (lines.length < 4 + sessionBudget) {
				lines.push(this.contentLine('', inner));
			}
		}

		lines.push(this.contentLine(this.theme.fg('dim', `  ${hLine(Math.max(0, inner - 2))}`), inner));
		lines.push(this.contentLine(this.theme.fg('muted', '  Activity Feed'), inner));

		const feedToShow = this.feed.slice(0, feedBudget);
		if (feedToShow.length === 0) {
			lines.push(this.contentLine(this.theme.fg('dim', '  (no activity yet)'), inner));
			for (let i = 1; i < feedBudget; i++) lines.push(this.contentLine('', inner));
		} else {
			for (const entry of feedToShow) {
				const line = `${this.theme.fg('dim', formatClock(entry.at))} ${entry.text}`;
				lines.push(this.contentLine(`  ${line}`, inner));
			}
			while (feedToShow.length + lines.length < maxLines - 2) {
				lines.push(this.contentLine('', inner));
			}
		}

		lines.push(this.contentLine(this.theme.fg('dim', '  [↑↓] Select  [Enter] Detail  [r] Refresh  [f] Feed  [Esc] Close'), inner));
		lines.push(buildBottomBorder(width));
		return lines.slice(0, maxLines);
	}

	private renderDetailScreen(width: number, maxLines: number): string[] {
		const inner = Math.max(0, width - 2);
		const lines: string[] = [];
		const title = this.detail?.label || this.detailSessionId || 'Hub Session';
		const headerRows = 2;
		const footerRows = 2;
		const contentBudget = Math.max(5, maxLines - headerRows - footerRows);

		lines.push(buildTopBorder(width, `Hub Session ${shortId(title)}`));
		lines.push(this.contentLine('', inner));

		const body: string[] = [];
		if (this.loadingDetail) {
			body.push(this.contentLine(this.theme.fg('dim', '  Loading session detail...'), inner));
		} else if (this.detailError) {
			body.push(this.contentLine(this.theme.fg('error', `  ${this.detailError}`), inner));
		} else if (!this.detail) {
			body.push(this.contentLine(this.theme.fg('muted', '  No detail available'), inner));
		} else {
			const session = this.detail;
			body.push(this.contentLine(this.theme.fg('muted', `  ID: ${session.sessionId}`), inner));
			body.push(this.contentLine(this.theme.fg('muted', `  Status: ${session.status}  Mode: ${session.mode}`), inner));
			body.push(this.contentLine(this.theme.fg('muted', `  Created: ${formatRelative(session.createdAt)}`), inner));
			if (session.context?.branch) {
				body.push(this.contentLine(this.theme.fg('muted', `  Branch: ${session.context.branch}`), inner));
			}
			if (session.context?.workingDirectory) {
				body.push(this.contentLine(this.theme.fg('muted', `  CWD: ${session.context.workingDirectory}`), inner));
			}
			body.push(this.contentLine(this.theme.fg('dim', `  ${hLine(Math.max(0, inner - 2))}`), inner));
			body.push(this.contentLine(this.theme.bold('  Participants'), inner));

			const participants = session.participants ?? [];
			if (participants.length === 0) {
				body.push(this.contentLine(this.theme.fg('dim', '  (none)'), inner));
			} else {
				for (const participant of participants) {
					const when = participant.connectedAt ? formatRelative(participant.connectedAt) : '-';
					const idle = participant.idle ? this.theme.fg('warning', ' idle') : '';
					body.push(
						this.contentLine(
							`  ${participant.id.padEnd(12)} ${participant.role.padEnd(9)} ${(participant.transport || 'ws').padEnd(3)} ${when}${idle}`,
							inner,
						),
					);
				}
			}

			body.push(this.contentLine(this.theme.fg('dim', `  ${hLine(Math.max(0, inner - 2))}`), inner));
			body.push(this.contentLine(this.theme.bold('  Tasks'), inner));
			const tasks = session.tasks ?? [];
			if (tasks.length === 0) {
				body.push(this.contentLine(this.theme.fg('dim', '  (none)'), inner));
			} else {
				for (const task of tasks.slice(0, 15)) {
					const statusColor =
						task.status === 'completed' ? 'success'
							: task.status === 'failed' ? 'error'
								: 'warning';
					const status = this.theme.fg(statusColor as 'success' | 'error' | 'warning', task.status);
					const prompt = task.prompt ? truncateToWidth(task.prompt, Math.max(16, inner - 34)) : '';
					const duration = typeof task.duration === 'number' ? ` ${task.duration}ms` : '';
					body.push(
						this.contentLine(
							`  ${shortId(task.taskId).padEnd(12)} ${task.agent.padEnd(9)} ${status}${duration} ${prompt}`,
							inner,
						),
					);
				}
			}

			body.push(this.contentLine(this.theme.fg('dim', `  ${hLine(Math.max(0, inner - 2))}`), inner));
			body.push(this.contentLine(this.theme.bold('  Agent Activity'), inner));
			const activity = session.agentActivity ?? {};
			const entries = Object.entries(activity);
			if (entries.length === 0) {
				body.push(this.contentLine(this.theme.fg('dim', '  (none)'), inner));
			} else {
				for (const [agent, info] of entries.slice(0, 15)) {
					const tool = info.currentTool ? ` ${info.currentTool}` : '';
					const calls =
						typeof info.toolCallCount === 'number'
							? this.theme.fg('dim', ` (${info.toolCallCount} calls)`)
							: '';
					const status = info.status || 'idle';
					body.push(this.contentLine(`  ${agent.padEnd(12)} ${status}${tool}${calls}`, inner));
				}
			}

			if (this.feedExpanded) {
				body.push(this.contentLine(this.theme.fg('dim', `  ${hLine(Math.max(0, inner - 2))}`), inner));
				body.push(this.contentLine(this.theme.bold('  Recent Feed'), inner));
				for (const entry of this.feed.slice(0, 8)) {
					body.push(this.contentLine(`  ${this.theme.fg('dim', formatClock(entry.at))} ${entry.text}`, inner));
				}
			}
		}

		this.detailMaxScroll = Math.max(0, body.length - contentBudget);
		if (this.detailScrollOffset > this.detailMaxScroll) {
			this.detailScrollOffset = this.detailMaxScroll;
		}
		const windowedBody = body.slice(this.detailScrollOffset, this.detailScrollOffset + contentBudget);
		lines.push(...windowedBody);
		while (lines.length < maxLines - footerRows) {
			lines.push(this.contentLine('', inner));
		}

		const scrollInfo = this.detailMaxScroll > 0
			? this.theme.fg('dim', `  scroll ${this.detailScrollOffset}/${this.detailMaxScroll}`)
			: this.theme.fg('dim', '  scroll 0/0');
		lines.push(
			this.contentLine(
				`${scrollInfo}  ${this.theme.fg('dim', '[↑↓] Scroll  [r] Refresh  [f] Feed  [Esc] Back')}`,
				inner,
			),
		);
		lines.push(buildBottomBorder(width));
		return lines.slice(0, maxLines);
	}

	private contentLine(text: string, innerWidth: number): string {
		return `│${padRight(text, innerWidth)}│`;
	}
}
