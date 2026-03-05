import { type Theme, getMarkdownTheme } from '@mariozechner/pi-coding-agent';
import { matchesKey, Markdown as MdComponent } from '@mariozechner/pi-tui';
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

interface HubTodoSummary {
	open?: number;
	in_progress?: number;
	done?: number;
	closed?: number;
	cancelled?: number;
}

interface HubTodo {
	id: string;
	title: string;
	status: string;
	type?: string;
	priority?: string;
	parentTaskId?: string | null;
	assignee?: string | null;
	origin?: string | null;
	attachmentCount?: number;
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
	todos?: HubTodo[];
	todoSummary?: HubTodoSummary;
	todosUnavailable?: string;
	agentActivity?: AgentActivity;
	stream?: {
		output?: string;
		thinking?: string;
		tasks?: Record<string, { output?: string; thinking?: string }>;
	};
}

interface HubTodoListResponse {
	ok?: boolean;
	count?: number;
	summary?: HubTodoSummary;
	todos?: HubTodo[];
	unavailable?: boolean;
	message?: string;
}

interface HubListResponse {
	sessions?: {
		websocket?: HubSessionSummary[];
	};
}

interface FeedEntry {
	at: number;
	sessionId?: string;
	text: string;
}

interface SessionDigest {
	status: string;
	taskCount: number;
	observerCount: number;
	subAgentCount: number;
}

interface SessionStreamState {
	controller: AbortController;
	mode: 'summary' | 'full';
}

interface StreamBuffer {
	output: string;
	thinking: string;
}

interface HubOverlayOptions {
	baseUrl: string;
	currentSessionId?: string;
	initialSessionId?: string;
	startInDetail?: boolean;
	done: (result: undefined) => void;
}

type ScreenMode = 'list' | 'detail' | 'feed' | 'task';

const ANSI_RE = /\x1b\[[0-9;]*m/g;
const POLL_MS = 4_000;
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_FEED_ITEMS = 80;
const STREAM_SESSION_LIMIT = 8;

function visibleWidth(text: string): number {
	return text.replace(ANSI_RE, '').replace(/\t/g, '    ').length;
}

function padRight(text: string, width: number): string {
	if (width <= 0) return '';
	const normalized = text.replace(/\t/g, '    ');
	const truncated = truncateToWidth(normalized, width);
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

function wrapText(text: string, width: number): string[] {
	if (width <= 0) return [''];
	if (!text) return [''];

	const lines: string[] = [];
	const paragraphs = text.split(/\r?\n/);
	for (const paragraph of paragraphs) {
		const words = paragraph.split(/\s+/).filter(Boolean);
		if (words.length === 0) {
			lines.push('');
			continue;
		}

		let current = words[0]!;
		for (let i = 1; i < words.length; i++) {
			const word = words[i]!;
			const candidate = `${current} ${word}`;
			if (candidate.length <= width) {
				current = candidate;
			} else {
				lines.push(current);
				current = word.length > width ? word.slice(0, width) : word;
			}
		}
		lines.push(current);
	}

	return lines;
}

function toSingleLine(text: string): string {
	return text
		.replace(/[\r\n\t]+/g, ' ')
		.replace(/[\x00-\x1f\x7f]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

interface MessageSegments {
	output: string;
	thinking: string;
}

function summarizeArgs(value: unknown, maxWidth = 100): string {
	if (!value || typeof value !== 'object') return '';
	const args = value as Record<string, unknown>;
	if (typeof args.command === 'string') return truncateToWidth(toSingleLine(args.command), maxWidth);
	if (typeof args.path === 'string') return truncateToWidth(toSingleLine(args.path), maxWidth);
	if (typeof args.filePath === 'string') return truncateToWidth(toSingleLine(args.filePath), maxWidth);
	if (typeof args.pattern === 'string') return truncateToWidth(toSingleLine(args.pattern), maxWidth);
	try {
		const raw = JSON.stringify(value);
		return truncateToWidth(toSingleLine(raw), 100);
	} catch {
		return '';
	}
}

function summarizeToolCall(name: string, argsRaw: unknown): string | null {
	const args = argsRaw && typeof argsRaw === 'object' ? argsRaw as Record<string, unknown> : undefined;

	if (name === 'task') {
		const agent = typeof args?.subagent_type === 'string' ? args.subagent_type : '?';
		const description = typeof args?.description === 'string'
			? truncateToWidth(toSingleLine(args.description), 80)
			: '';
		return description ? `${agent} - ${description}` : `${agent} - delegated task`;
	}

	if (name === 'parallel_tasks') {
		const tasks = Array.isArray(args?.tasks) ? args.tasks : [];
		const agents = tasks
			.map((task) => task && typeof task === 'object' ? (task as Record<string, unknown>).subagent_type : undefined)
			.filter((agent): agent is string => typeof agent === 'string');
		if (agents.length > 0) return agents.join(' + ');
		return 'parallel delegated tasks';
	}

	return null;
}

function extractToolResultText(contentRaw: unknown): string {
	if (typeof contentRaw === 'string') return contentRaw;
	if (!Array.isArray(contentRaw)) return '';
	const parts: string[] = [];
	for (const item of contentRaw) {
		if (!item || typeof item !== 'object') continue;
		const block = item as Record<string, unknown>;
		if (typeof block.text === 'string') {
			parts.push(block.text);
		}
	}
	return parts.join('\n');
}

function formatDuration(ms: number): string {
	if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
	return `${ms}ms`;
}

function extractMessageSegments(data: Record<string, unknown> | undefined): MessageSegments {
	const fallback = typeof data?.text === 'string' ? data.text : '';
	const messageRaw = data?.message;
	if (!messageRaw || typeof messageRaw !== 'object') {
		return { output: fallback, thinking: '' };
	}

	const message = messageRaw as Record<string, unknown>;
	const role = typeof message.role === 'string' ? message.role : '';
	if (role && role !== 'assistant') {
		return { output: '', thinking: '' };
	}

	const content = message.content;
	const outputParts: string[] = [];
	const thinkingParts: string[] = [];

	if (typeof content === 'string') {
		outputParts.push(content);
	} else if (Array.isArray(content)) {
		for (const blockRaw of content) {
			if (!blockRaw || typeof blockRaw !== 'object') continue;
			const block = blockRaw as Record<string, unknown>;
			const type = typeof block.type === 'string' ? block.type : '';

			if (type === 'text' && typeof block.text === 'string') {
				outputParts.push(block.text);
				continue;
			}
			if (type === 'thinking' && typeof block.thinking === 'string') {
				thinkingParts.push(block.thinking);
				continue;
			}
		}
	}

	if (outputParts.length === 0 && fallback) {
		outputParts.push(fallback);
	}

	return {
		output: outputParts.join('\n\n').trim(),
		thinking: thinkingParts.join('\n\n').trim(),
	};
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
	private feedScrollOffset = 0;
	private feedMaxScroll = 0;
	private feedScope: 'global' | 'session' = 'global';
	private feedViewMode: 'stream' | 'events' = 'stream';
	private showFeedThinking = true;
	private feedFollowing = true;
	private taskScrollOffset = 0;
	private taskMaxScroll = 0;
	private selectedTaskIndex = 0;
	private showTaskThinking = true;
	private taskFollowing = true;

	private sessions: HubSessionSummary[] = [];
	private detail: HubSessionDetail | null = null;
	private cachedTodos: { todos: any[]; summary: any; sessionId: string } | null = null;
	private feed: FeedEntry[] = [];
	private sessionFeed = new Map<string, FeedEntry[]>();
	private sessionBuffers = new Map<string, StreamBuffer>();
	private taskBuffers = new Map<string, StreamBuffer>();
	private hydratedSessions = new Set<string>();
	private previousDigests = new Map<string, SessionDigest>();

	private loadingList = true;
	private loadingDetail = false;
	private listError = '';
	private detailError = '';
	private lastUpdatedAt = 0;
	private listInFlight = false;
	private detailInFlight = false;
	private sseControllers = new Map<string, SessionStreamState>();

	private disposed = false;
	private pollTimer: ReturnType<typeof setInterval> | null = null;
	private mdRenderer: MdComponent | null = null;

	constructor(tui: TUIRef, theme: Theme, options: HubOverlayOptions) {
		this.tui = tui;
		this.theme = theme;
		this.done = options.done;
		this.baseUrl = options.baseUrl;
		this.currentSessionId = options.currentSessionId;
		this.detailSessionId = options.initialSessionId ?? null;
		this.screen = options.startInDetail && options.initialSessionId ? 'detail' : 'list';
		try {
			const mdTheme = getMarkdownTheme?.();
			if (mdTheme) {
				this.mdRenderer = new MdComponent('', 0, 0, mdTheme);
			}
		} catch {
			this.mdRenderer = null;
		}

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

		const inSessionContext = this.isSessionContext();

		if (data === '1') {
			this.screen = inSessionContext ? 'detail' : 'list';
			void this.syncSseStreams(this.sessions);
			this.requestRender();
			return;
		}

		if (data === '2') {
			// Session/task views use task drill-down, not direct feed jumps from task screen.
			if (this.screen === 'task') return;

			if (inSessionContext && this.detailSessionId) {
				this.feedScope = 'session';
				this.feedViewMode = 'stream';
			} else {
				this.feedScope = 'global';
				this.feedViewMode = 'events';
			}
			this.feedScrollOffset = 0;
			this.feedFollowing = true;
			this.screen = 'feed';
			void this.syncSseStreams(this.sessions);
			this.requestRender();
			return;
		}

		if (data === '3') {
			const atSessionLevel = !!this.detailSessionId
				&& (this.screen === 'detail' || (this.screen === 'feed' && this.feedScope === 'session'));
			if (!atSessionLevel) return;

			this.feedScope = 'session';
			this.feedViewMode = 'events';
			this.feedScrollOffset = 0;
			this.feedFollowing = true;
			this.screen = 'feed';
			void this.syncSseStreams(this.sessions);
			this.requestRender();
			return;
		}

		if (matchesKey(data, 'escape')) {
			if (this.screen === 'task') {
				this.screen = 'detail';
				void this.syncSseStreams(this.sessions);
				this.requestRender();
				return;
			}
			if (this.screen === 'feed') {
				this.screen = this.feedScope === 'session' ? 'detail' : 'list';
				void this.syncSseStreams(this.sessions);
				this.requestRender();
				return;
			}
			if (this.screen === 'detail') {
				this.screen = 'list';
				void this.syncSseStreams(this.sessions);
				this.requestRender();
				return;
			}
			this.close();
			return;
		}

		if (matchesKey(data, 'r') || data.toLowerCase() === 'r') {
			void this.refreshList();
			if ((this.screen === 'detail' || this.screen === 'task' || this.screen === 'feed') && this.detailSessionId) {
				void this.refreshDetail(this.detailSessionId);
			}
			return;
		}

		if (this.screen === 'list') {
			this.handleListInput(data);
			return;
		}

		if (this.screen === 'feed') {
			this.handleFeedInput(data);
			return;
		}

		if (this.screen === 'task') {
			this.handleTaskInput(data);
			return;
		}

		this.handleDetailInput(data);
	}

	render(width: number): string[] {
		const safeWidth = Math.max(6, width);
		const termHeight = process.stdout.rows || 40;
		const maxLines = Math.max(12, Math.floor(termHeight * 0.95) - 2);

		const lines =
			this.screen === 'detail'
				? this.renderDetailScreen(safeWidth, maxLines)
				: this.screen === 'feed'
					? this.renderFeedScreen(safeWidth, maxLines)
					: this.screen === 'task'
						? this.renderTaskScreen(safeWidth, maxLines)
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
		for (const stream of this.sseControllers.values()) {
			stream.controller.abort();
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
			this.selectedTaskIndex = 0;
			this.showTaskThinking = true;
			this.taskFollowing = true;
			this.screen = 'detail';
			void this.syncSseStreams(this.sessions);
			void this.refreshDetail(selected.sessionId, true);
			this.requestRender();
		}
	}

	private isSessionContext(): boolean {
		return this.screen === 'detail' || this.screen === 'task' || (this.screen === 'feed' && this.feedScope === 'session');
	}

	private handleDetailInput(data: string): void {
		const tasks = this.getDetailTasks();

		if (matchesKey(data, 'up')) {
			if (tasks.length > 0) {
				this.selectedTaskIndex = (this.selectedTaskIndex - 1 + tasks.length) % tasks.length;
				this.requestRender();
			}
			return;
		}

		if (matchesKey(data, 'down')) {
			if (tasks.length > 0) {
				this.selectedTaskIndex = (this.selectedTaskIndex + 1) % tasks.length;
				this.requestRender();
			}
			return;
		}

		if (matchesKey(data, 'enter')) {
			if (tasks.length > 0) {
				this.selectedTaskIndex = Math.min(this.selectedTaskIndex, tasks.length - 1);
				this.taskScrollOffset = 0;
				this.showTaskThinking = true;
				this.taskFollowing = true;
				this.screen = 'task';
				this.requestRender();
			}
			return;
		}

		if (data.toLowerCase() === 'k') {
			if (this.detailScrollOffset > 0) {
				this.detailScrollOffset -= 1;
				this.requestRender();
			}
			return;
		}

		if (data.toLowerCase() === 'j') {
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

	private handleFeedInput(data: string): void {
		const maxScroll = this.feedMaxScroll;
		const jump = Math.max(1, Math.floor((process.stdout.rows || 40) / 3));

		if (matchesKey(data, 't') || data.toLowerCase() === 't') {
			if (this.feedScope === 'session' && this.feedViewMode === 'stream') {
				this.showFeedThinking = !this.showFeedThinking;
				this.requestRender();
			}
			return;
		}

		if (
			this.feedScope === 'session'
			&& this.feedViewMode === 'stream'
			&& (matchesKey(data, 'enter') || matchesKey(data, 'v') || data.toLowerCase() === 'v')
		) {
			const tasks = this.getDetailTasks();
			if (tasks.length > 0) {
				this.selectedTaskIndex = Math.min(this.selectedTaskIndex, tasks.length - 1);
				this.taskScrollOffset = 0;
				this.showTaskThinking = true;
				this.taskFollowing = true;
				this.screen = 'task';
				this.requestRender();
			}
			return;
		}

		if (matchesKey(data, 'f') || data.toLowerCase() === 'f') {
			this.feedFollowing = !this.feedFollowing;
			if (this.feedFollowing) {
				this.feedScrollOffset = maxScroll;
			}
			this.requestRender();
			return;
		}

		if (matchesKey(data, 'up') || data.toLowerCase() === 'k') {
			if (this.feedScrollOffset > 0) {
				this.feedFollowing = false;
				this.feedScrollOffset -= 1;
				this.requestRender();
			}
			return;
		}

		if (matchesKey(data, 'down') || data.toLowerCase() === 'j') {
			if (this.feedScrollOffset < this.feedMaxScroll) {
				this.feedFollowing = false;
				this.feedScrollOffset += 1;
				this.requestRender();
			}
			return;
		}

		if (matchesKey(data, 'pageUp') || matchesKey(data, 'shift+up')) {
			this.feedFollowing = false;
			this.feedScrollOffset = Math.max(0, this.feedScrollOffset - jump);
			this.requestRender();
			return;
		}

		if (matchesKey(data, 'pageDown') || matchesKey(data, 'shift+down')) {
			this.feedFollowing = false;
			this.feedScrollOffset = Math.min(this.feedMaxScroll, this.feedScrollOffset + jump);
			this.requestRender();
			return;
		}

		if (data === 'g') {
			this.feedFollowing = false;
			this.feedScrollOffset = 0;
			this.requestRender();
			return;
		}

		if (data === 'G') {
			this.feedFollowing = false;
			this.feedScrollOffset = this.feedMaxScroll;
			this.requestRender();
			return;
		}

		if (data === '{') {
			this.feedFollowing = false;
			const segment = Math.max(1, Math.floor((this.feedMaxScroll || 1) * 0.25));
			this.feedScrollOffset = Math.max(0, this.feedScrollOffset - segment);
			this.requestRender();
			return;
		}

		if (data === '}') {
			this.feedFollowing = false;
			const segment = Math.max(1, Math.floor((this.feedMaxScroll || 1) * 0.25));
			this.feedScrollOffset = Math.min(this.feedMaxScroll, this.feedScrollOffset + segment);
			this.requestRender();
			return;
		}
	}

	private handleTaskInput(data: string): void {
		const tasks = this.getDetailTasks();
		const maxScroll = this.taskMaxScroll;
		const jump = Math.max(1, Math.floor((process.stdout.rows || 40) / 3));

		if (matchesKey(data, 't') || data.toLowerCase() === 't') {
			this.showTaskThinking = !this.showTaskThinking;
			this.requestRender();
			return;
		}

		if (matchesKey(data, 'f') || data.toLowerCase() === 'f') {
			this.taskFollowing = !this.taskFollowing;
			if (this.taskFollowing) {
				this.taskScrollOffset = maxScroll;
			}
			this.requestRender();
			return;
		}

		if (data === '[') {
			if (tasks.length > 0) {
				this.selectedTaskIndex = (this.selectedTaskIndex - 1 + tasks.length) % tasks.length;
				this.taskScrollOffset = 0;
				this.taskFollowing = true;
				this.requestRender();
			}
			return;
		}

		if (data === ']') {
			if (tasks.length > 0) {
				this.selectedTaskIndex = (this.selectedTaskIndex + 1) % tasks.length;
				this.taskScrollOffset = 0;
				this.taskFollowing = true;
				this.requestRender();
			}
			return;
		}

		if (matchesKey(data, 'up') || data.toLowerCase() === 'k') {
			if (this.taskScrollOffset > 0) {
				this.taskFollowing = false;
				this.taskScrollOffset -= 1;
				this.requestRender();
			}
			return;
		}

		if (matchesKey(data, 'down') || data.toLowerCase() === 'j') {
			if (this.taskScrollOffset < this.taskMaxScroll) {
				this.taskFollowing = false;
				this.taskScrollOffset += 1;
				this.requestRender();
			}
			return;
		}

		if (matchesKey(data, 'pageUp') || matchesKey(data, 'shift+up')) {
			this.taskFollowing = false;
			this.taskScrollOffset = Math.max(0, this.taskScrollOffset - jump);
			this.requestRender();
			return;
		}

		if (matchesKey(data, 'pageDown') || matchesKey(data, 'shift+down')) {
			this.taskFollowing = false;
			this.taskScrollOffset = Math.min(this.taskMaxScroll, this.taskScrollOffset + jump);
			this.requestRender();
			return;
		}

		if (data === 'g') {
			this.taskFollowing = false;
			this.taskScrollOffset = 0;
			this.requestRender();
			return;
		}

		if (data === 'G') {
			this.taskFollowing = false;
			this.taskScrollOffset = this.taskMaxScroll;
			this.requestRender();
			return;
		}

		if (data === '{') {
			this.taskFollowing = false;
			const segment = Math.max(1, Math.floor((this.taskMaxScroll || 1) * 0.25));
			this.taskScrollOffset = Math.max(0, this.taskScrollOffset - segment);
			this.requestRender();
			return;
		}

		if (data === '}') {
			this.taskFollowing = false;
			const segment = Math.max(1, Math.floor((this.taskMaxScroll || 1) * 0.25));
			this.taskScrollOffset = Math.min(this.taskMaxScroll, this.taskScrollOffset + segment);
			this.requestRender();
			return;
		}
	}

	private getDetailTasks(): HubTask[] {
		return this.detail?.tasks ?? [];
	}

	private getSessionBuffer(sessionId: string): StreamBuffer {
		let buffer = this.sessionBuffers.get(sessionId);
		if (!buffer) {
			buffer = { output: '', thinking: '' };
			this.sessionBuffers.set(sessionId, buffer);
		}
		return buffer;
	}

	private getTaskBuffer(sessionId: string, taskId: string): StreamBuffer {
		const key = this.getTaskFeedKey(sessionId, taskId);
		let buffer = this.taskBuffers.get(key);
		if (!buffer) {
			buffer = { output: '', thinking: '' };
			this.taskBuffers.set(key, buffer);
		}
		return buffer;
	}

	private appendBufferText(
		sessionId: string,
		kind: 'output' | 'thinking',
		chunk: string,
		taskId?: string,
	): void {
		if (!chunk) return;

		// Session stream is lead/top-level only; task-scoped output lives in task buffers.
		if (!taskId) {
			const sessionBuffer = this.getSessionBuffer(sessionId);
			if (kind === 'output') sessionBuffer.output += chunk;
			else sessionBuffer.thinking += chunk;
		}

		if (taskId) {
			const taskBuffer = this.getTaskBuffer(sessionId, taskId);
			if (kind === 'output') taskBuffer.output += chunk;
			else taskBuffer.thinking += chunk;
		}
	}

	private renderMarkdownLines(text: string, width: number): string[] {
		if (!text) return [];
		const safeWidth = Math.max(20, width);
		if (this.mdRenderer) {
			try {
				this.mdRenderer.setText(text);
				return this.mdRenderer.render(safeWidth);
			} catch {
				return text.split(/\r?\n/);
			}
		}
		return text.split(/\r?\n/);
	}

	private renderStreamLines(
		output: string,
		thinking: string,
		showThinking: boolean,
		width: number,
	): string[] {
		const lines: string[] = [];

		if (showThinking && thinking.trim()) {
			for (const line of thinking.split(/\r?\n/)) {
				lines.push(this.theme.fg('dim', line));
			}
			lines.push(this.theme.fg('muted', '--- end thinking ---'));
			lines.push('');
		}

		if (output.trim()) {
			lines.push(...this.renderMarkdownLines(output, width));
		}

		return lines;
	}

	private buildTopTabs(active: 'detail' | 'feed' | 'events' | 'list', sessionTabs: boolean): string {
		const divider = this.theme.fg('dim', ' | ');
		const tab = (key: string, label: string, isActive: boolean): string => {
			const text = `[${key}] ${label}`;
			return isActive
				? this.theme.bold(this.theme.fg('accent', text))
				: this.theme.fg('dim', text);
		};

		if (sessionTabs) {
			return `  ${tab('1', 'Detail', active === 'detail')}${divider}${tab('2', 'Feed', active === 'feed')}${divider}${tab('3', 'Events', active === 'events')}`;
		}

		return `  ${tab('1', 'List', active === 'list')}${divider}${tab('2', 'Feed', active === 'feed')}`;
	}

	private async fetchJson<T>(path: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
			const [detail, todosResponse] = await Promise.all([
				this.fetchJson<HubSessionDetail>(
					`/api/hub/session/${encodeURIComponent(sessionId)}`,
				),
				this.fetchJson<HubTodoListResponse>(
					`/api/hub/session/${encodeURIComponent(sessionId)}/todos?includeTerminal=true&includeSync=true&limit=30`,
					15_000,
				).catch((err: any) => {
					const isAbort = err?.name === 'AbortError' || err?.message?.includes('aborted');
					return {
						_fetchError: true,
						message: isAbort ? 'Todos loading\u2026' : (err?.message || 'Failed to load todos'),
					} as any;
				}),
			]);
			if (todosResponse?._fetchError) {
				// Use cached todos if available, show loading indicator
				if (this.cachedTodos && this.cachedTodos.sessionId === sessionId) {
					detail.todos = this.cachedTodos.todos;
					detail.todoSummary = this.cachedTodos.summary;
					detail.todosUnavailable = todosResponse.message;
				} else {
					detail.todosUnavailable = todosResponse.message;
				}
			} else if (todosResponse) {
				detail.todos = Array.isArray(todosResponse.todos) ? todosResponse.todos : [];
				detail.todoSummary =
					todosResponse.summary && typeof todosResponse.summary === 'object'
						? todosResponse.summary
						: undefined;
				detail.todosUnavailable = todosResponse.unavailable
					? (typeof todosResponse.message === 'string' ? todosResponse.message : 'Task service unavailable')
					: undefined;
				// Cache successful todo data
				if (detail.todos && detail.todos.length > 0) {
					this.cachedTodos = { todos: detail.todos, summary: detail.todoSummary, sessionId };
				}
			}
			this.detail = detail;
			this.detailSessionId = sessionId;
			this.applyStreamProjection(sessionId, detail.stream);
			const taskCount = detail.tasks?.length ?? 0;
			if (taskCount === 0) {
				this.selectedTaskIndex = 0;
			} else if (this.selectedTaskIndex >= taskCount) {
				this.selectedTaskIndex = taskCount - 1;
			}
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
				this.pushFeed(`${label}: session discovered (${session.mode})`, session.sessionId);
			} else {
				if (prev.status !== session.status) {
					this.pushFeed(`${label}: ${prev.status} -> ${session.status}`, session.sessionId);
				}
				if (session.taskCount > prev.taskCount) {
					const delta = session.taskCount - prev.taskCount;
					this.pushFeed(`${label}: +${delta} task${delta === 1 ? '' : 's'}`, session.sessionId);
				}
				if (session.observerCount !== prev.observerCount) {
					this.pushFeed(`${label}: observers ${prev.observerCount} -> ${session.observerCount}`, session.sessionId);
				}
				if (session.subAgentCount !== prev.subAgentCount) {
					this.pushFeed(`${label}: agents ${prev.subAgentCount} -> ${session.subAgentCount}`, session.sessionId);
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
				this.pushFeed(`${shortId(oldSessionId)}: session removed`, oldSessionId);
			}
		}

		this.previousDigests = nextDigests;
	}

	private async syncSseStreams(sessions: HubSessionSummary[]): Promise<void> {
		if (this.disposed) return;
		const desiredModes = new Map<string, 'summary' | 'full'>();
		for (const session of sessions.slice(0, STREAM_SESSION_LIMIT)) {
			desiredModes.set(session.sessionId, 'summary');
		}
		if (this.detailSessionId && this.isSessionContext()) {
			desiredModes.set(this.detailSessionId, 'full');
		}

		for (const [sessionId, stream] of this.sseControllers) {
			const desiredMode = desiredModes.get(sessionId);
			if (!desiredMode) {
				stream.controller.abort();
				this.sseControllers.delete(sessionId);
				continue;
			}
			if (stream.mode !== desiredMode) {
				stream.controller.abort();
				this.sseControllers.delete(sessionId);
			}
		}

		for (const [sessionId, mode] of desiredModes) {
			if (!this.sseControllers.has(sessionId)) {
				void this.startSseStream(sessionId, mode);
			}
		}
	}

	private async startSseStream(sessionId: string, mode: 'summary' | 'full'): Promise<void> {
		if (this.disposed) return;
		const existing = this.sseControllers.get(sessionId);
		if (existing && existing.mode === mode) return;
		if (existing) {
			existing.controller.abort();
			this.sseControllers.delete(sessionId);
		}

		const controller = new AbortController();
		this.sseControllers.set(sessionId, { controller, mode });
		const subscribe = mode === 'full' ? '*' : 'session_*,task_*,agent_*';

		try {
			const response = await fetch(
				`${this.baseUrl}/api/hub/session/${encodeURIComponent(sessionId)}/events?subscribe=${encodeURIComponent(subscribe)}`,
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
				buffer = this.consumeSseBuffer(sessionId, mode, buffer);
			}
		} catch (err) {
			if (controller.signal.aborted || this.disposed) return;
			const label = this.getSessionLabel(sessionId);
			const msg = err instanceof Error ? err.message : String(err);
			this.pushFeed(`${label}: stream error (${msg})`, sessionId);
			this.requestRender();
		} finally {
			const current = this.sseControllers.get(sessionId);
			if (current && current.controller === controller) {
				this.sseControllers.delete(sessionId);
			}
		}
	}

	private consumeSseBuffer(sessionId: string, mode: 'summary' | 'full', rawBuffer: string): string {
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
			this.handleSseEvent(sessionId, mode, eventName, dataText);
		}

		return normalized.slice(cursor);
	}

	private handleSseEvent(
		sessionId: string,
		mode: 'summary' | 'full',
		sseEvent: string,
		dataText: string,
	): void {
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

		if (eventName === 'hydration') {
			this.applyHydration(sessionId, eventData);
			return;
		}
		if (eventName === 'snapshot') {
			return;
		}

		const data = eventData && typeof eventData === 'object'
			? eventData as Record<string, unknown>
			: undefined;
		const taskId = typeof data?.taskId === 'string' ? data.taskId : undefined;

		const text = this.formatEventFeedLine(sessionId, eventName, eventData);
		if (text) {
			this.pushFeed(text, sessionId);
		}
		if (mode === 'full') {
			this.captureStreamContent(sessionId, eventName, eventData, taskId);
			const streamLine = this.formatStreamLine(eventName, eventData);
			if (streamLine) {
				this.pushSessionFeed(sessionId, streamLine, taskId);
			}
		}
		this.requestRender();

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
			const stream = this.sseControllers.get(sessionId);
			if (stream) {
				stream.controller.abort();
				this.sseControllers.delete(sessionId);
			}
		}
	}

	private applyHydration(sessionId: string, eventData: unknown): void {
		if (this.hydratedSessions.has(sessionId)) return;
		if (!eventData || typeof eventData !== 'object') return;
		const payload = eventData as Record<string, unknown>;
		const loadedFromProjection = this.applyStreamProjection(sessionId, payload.stream);

		if (!loadedFromProjection) {
			const entries = Array.isArray(payload.entries) ? payload.entries : [];
			for (const rawEntry of entries) {
				if (!rawEntry || typeof rawEntry !== 'object') continue;
				const entry = rawEntry as Record<string, unknown>;
				const type = typeof entry.type === 'string' ? entry.type : '';
				const content = typeof entry.content === 'string' ? entry.content : '';
				const taskId = typeof entry.taskId === 'string' ? entry.taskId : undefined;

				if (!content) continue;
				if (type === 'message' || type === 'task_result') {
					this.appendBufferText(sessionId, 'output', content + '\n\n', taskId);
				} else if (type === 'thinking') {
					this.appendBufferText(sessionId, 'thinking', content + '\n\n', taskId);
				}
			}
		}

		this.hydratedSessions.add(sessionId);
	}

	private applyStreamProjection(sessionId: string, streamRaw: unknown): boolean {
		if (!streamRaw || typeof streamRaw !== 'object') return false;
		const stream = streamRaw as Record<string, unknown>;
		const sessionBuffer = this.getSessionBuffer(sessionId);
		sessionBuffer.output = typeof stream.output === 'string' ? stream.output : '';
		sessionBuffer.thinking = typeof stream.thinking === 'string' ? stream.thinking : '';
		const taskStreams = stream.tasks && typeof stream.tasks === 'object'
			? stream.tasks as Record<string, unknown>
			: {};
		for (const [taskId, rawBlock] of Object.entries(taskStreams)) {
			if (!rawBlock || typeof rawBlock !== 'object') continue;
			const block = rawBlock as Record<string, unknown>;
			const taskBuffer = this.getTaskBuffer(sessionId, taskId);
			taskBuffer.output = typeof block.output === 'string' ? block.output : '';
			taskBuffer.thinking = typeof block.thinking === 'string' ? block.thinking : '';
		}
		return true;
	}

	private captureStreamContent(sessionId: string, eventName: string, eventData: unknown, taskId?: string): void {
		const data = eventData && typeof eventData === 'object'
			? eventData as Record<string, unknown>
			: undefined;

		if (eventName === 'message_update') {
			const assistantMessageEvent = data?.assistantMessageEvent;
			if (assistantMessageEvent && typeof assistantMessageEvent === 'object') {
				const ame = assistantMessageEvent as Record<string, unknown>;
				const type = typeof ame.type === 'string' ? ame.type : '';
				const delta = typeof ame.delta === 'string' ? ame.delta : '';
				if (type === 'text_delta' && delta) {
					this.appendBufferText(sessionId, 'output', delta, taskId);
				} else if (type === 'thinking_delta' && delta) {
					this.appendBufferText(sessionId, 'thinking', delta, taskId);
				}
			}
			return;
		}

		if (eventName === 'message_end') {
			const segments = extractMessageSegments(data);
			if (segments.thinking) {
				this.appendBufferText(sessionId, 'thinking', segments.thinking + '\n\n', taskId);
			}
			if (segments.output) {
				this.appendBufferText(sessionId, 'output', segments.output + '\n\n', taskId);
			}
			return;
		}

		if (eventName === 'thinking_end') {
			const text = typeof data?.text === 'string' ? data.text : '';
			if (text) this.appendBufferText(sessionId, 'thinking', text + '\n\n', taskId);
			return;
		}

		if (eventName === 'agent_progress') {
			const status = typeof data?.status === 'string' ? data.status : '';
			const delta = typeof data?.delta === 'string' ? data.delta : '';
			if (status === 'text_delta' && delta) {
				this.appendBufferText(sessionId, 'output', delta, taskId);
			} else if (status === 'thinking_delta' && delta) {
				this.appendBufferText(sessionId, 'thinking', delta, taskId);
			}
			return;
		}

		if (eventName === 'tool_call' || eventName === 'tool_result') {
			const line = this.formatStreamLine(eventName, eventData);
			if (line) this.appendBufferText(sessionId, 'output', `${line}\n\n`, taskId);
			return;
		}

		if (eventName === 'task_complete') {
			const result = typeof data?.result === 'string' ? data.result : '';
			if (result) this.appendBufferText(sessionId, 'output', result + '\n\n', taskId);
			return;
		}

		if (eventName === 'task_error') {
			const error = typeof data?.error === 'string' ? data.error : '';
			if (error) this.appendBufferText(sessionId, 'output', `[task error] ${error}\n`, taskId);
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

		return null;
	}

	private getSessionLabel(sessionId: string): string {
		const session = this.sessions.find((item) => item.sessionId === sessionId);
		return session?.label || shortId(sessionId);
	}

	private getFeedEntries(scope: 'global' | 'session'): FeedEntry[] {
		if (scope === 'session' && this.detailSessionId) {
			return this.sessionFeed.get(this.detailSessionId) ?? [];
		}
		return this.feed;
	}

	private pushFeed(text: string, sessionId?: string): void {
		this.feed.unshift({ at: Date.now(), sessionId, text });
		if (this.feed.length > MAX_FEED_ITEMS) {
			this.feed.length = MAX_FEED_ITEMS;
		}
	}

	private pushSessionFeed(sessionId: string, text: string, taskId?: string): void {
		const entries = this.sessionFeed.get(sessionId) ?? [];
		entries.unshift({ at: Date.now(), sessionId, text });
		if (entries.length > MAX_FEED_ITEMS) entries.length = MAX_FEED_ITEMS;
		this.sessionFeed.set(sessionId, entries);

		if (taskId) {
			// Keep task-scoped stream buffers warm for immediate task-view drill-in.
			this.getTaskBuffer(sessionId, taskId);
		}
	}

	private formatStreamLine(eventName: string, eventData: unknown): string | null {
		const data = eventData && typeof eventData === 'object'
			? eventData as Record<string, unknown>
			: undefined;
		const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();

		if (eventName === 'message_update') {
			const assistantMessageEvent = data?.assistantMessageEvent;
			if (assistantMessageEvent && typeof assistantMessageEvent === 'object') {
				const ame = assistantMessageEvent as Record<string, unknown>;
				const type = typeof ame.type === 'string' ? ame.type : '';
				const delta = typeof ame.delta === 'string' ? ame.delta : '';
				// Keep event view high-signal: show text streaming, suppress thinking token spam.
				if (type === 'text_delta' && delta) {
					const cleaned = truncateToWidth(normalize(delta), 120);
					if (cleaned) {
						return `${type || 'delta'} ${cleaned}`;
					}
				}
			}
			return null;
		}

		if (eventName === 'message_end') {
			const segments = extractMessageSegments(data);
			const output = segments.output || segments.thinking;
			const cleaned = output ? truncateToWidth(normalize(output), 120) : '';
			return cleaned ? `message ${cleaned}` : 'message_end';
		}

		if (eventName === 'thinking_end' && typeof data?.text === 'string') {
			const cleaned = truncateToWidth(normalize(data.text), 120);
			return cleaned ? `thinking ${cleaned}` : 'thinking_end';
		}

		if (eventName === 'tool_call') {
			const name = typeof data?.name === 'string' ? data.name
				: typeof data?.toolName === 'string' ? data.toolName
					: 'tool';
			const input = data?.args ?? data?.input;
			const summarized = summarizeToolCall(name, input);
			if (summarized) return summarized;
			const argsPreview = summarizeArgs(input, 90);
			return argsPreview ? `tool_call ${name} ${argsPreview}` : `tool_call ${name}`;
		}

		if (eventName === 'tool_result') {
			const name = typeof data?.name === 'string' ? data.name
				: typeof data?.toolName === 'string' ? data.toolName
					: 'tool';
			const input = (data?.args ?? data?.input) as Record<string, unknown> | undefined;
			if (name === 'task') {
				const agent = typeof input?.subagent_type === 'string' ? input.subagent_type : 'agent';
				const description = typeof input?.description === 'string'
					? truncateToWidth(toSingleLine(input.description), 80)
					: '';
				const header = description ? `${agent} - ${description}` : `${agent} - delegated task`;

				const rawResult = extractToolResultText(data?.content);
				const stats = rawResult.match(/_(\w+): (\d+)ms \| (\d+) in (\d+) out tokens \| \$([0-9.]+)_/);
				if (stats) {
					const durationMs = Number(stats[2] ?? 0);
					const tokIn = stats[3] ?? '0';
					const tokOut = stats[4] ?? '0';
					const cost = stats[5] ?? '0';
					return `${header}\ndone ${formatDuration(durationMs)} ↑${tokIn} ↓${tokOut} $${cost}`;
				}

				const details = data?.details && typeof data.details === 'object'
					? data.details as Record<string, unknown>
					: undefined;
				const duration = typeof details?.duration === 'number'
					? ` ${formatDuration(details.duration)}`
					: '';
				const failed = data?.isError === true || details?.error === true;
				return `${header}\n${failed ? 'failed' : `done${duration}`}`;
			}
			return `tool_result ${name}`;
		}

		if (eventName === 'agent_progress') {
			const agent = typeof data?.agentName === 'string' ? data.agentName : 'agent';
			const status = typeof data?.status === 'string' ? data.status : 'progress';
			const toolName = typeof data?.currentTool === 'string' ? data.currentTool : '';
			const toolArgsRaw = typeof data?.currentToolArgs === 'string' ? data.currentToolArgs : '';
			const toolArgs = toolArgsRaw
				? truncateToWidth(normalize(toolArgsRaw), 80)
				: '';

			// Deltas are already represented in rendered stream mode; skip them in event mode
			// to avoid noisy, low-signal token lines.
			if (status.endsWith('_delta')) {
				return null;
			}

			if (status === 'tool_start') {
				const parts = ['tool_call', agent];
				if (toolName) parts.push(toolName);
				if (toolArgs) parts.push(toolArgs);
				return parts.join(' ');
			}

			if (status === 'tool_end') {
				return toolName
					? `tool_result ${agent} ${toolName}`
					: `tool_result ${agent}`;
			}

			if (status === 'completed' || status === 'failed') {
				return `agent ${agent} ${status}`;
			}

			if (status === 'running' && toolName) {
				return toolArgs
					? `agent ${agent} running ${toolName} ${toolArgs}`
					: `agent ${agent} running ${toolName}`;
			}

			return null;
		}

		const parts: string[] = [];
		if (typeof data?.taskId === 'string') parts.push(shortId(data.taskId));
		if (typeof data?.agent === 'string') parts.push(data.agent);
		else if (typeof data?.agentName === 'string') parts.push(data.agentName);
		else if (typeof data?.name === 'string') parts.push(data.name);
		if (typeof data?.status === 'string') parts.push(data.status);
		if (typeof data?.message === 'string') parts.push(data.message);
		if (typeof data?.error === 'string') parts.push(`error: ${data.error}`);
		if (typeof data?.text === 'string') parts.push(data.text);
		if (typeof data?.delta === 'string') parts.push(data.delta);

		let detail = parts.find((part) => part.trim().length > 0) ?? '';

		if (detail) {
			detail = truncateToWidth(normalize(detail), 120);
			return `${eventName} ${detail}`;
		}

		if (eventData !== undefined) {
			try {
				const serialized = typeof eventData === 'string' ? eventData : JSON.stringify(eventData);
				if (serialized) {
					const compact = truncateToWidth(serialized.replace(/\s+/g, ' ').trim(), 140);
					return `${eventName} ${compact}`;
				}
			} catch {
				// Best-effort formatting only.
			}
		}
		return null;
	}

	private getTaskFeedKey(sessionId: string, taskId: string): string {
		return `${sessionId}:${taskId}`;
	}

	private renderListScreen(width: number, maxLines: number): string[] {
		const inner = Math.max(0, width - 2);
		const lines: string[] = [];
		const headerRows = 2;
		const footerRows = 2;
		const contentBudget = Math.max(5, maxLines - headerRows - footerRows);
		const body: string[] = [];

		lines.push(buildTopBorder(width, 'Coder Hub Sessions'));
		lines.push(this.contentLine('', inner));

		if (this.loadingList) {
			body.push(this.contentLine(this.theme.fg('dim', '  Loading sessions...'), inner));
		} else if (this.listError) {
			body.push(this.contentLine(this.theme.fg('error', `  ${this.listError}`), inner));
		} else {
			const updated = this.lastUpdatedAt ? `${formatClock(this.lastUpdatedAt)} updated` : 'not updated';
			body.push(this.contentLine(this.theme.fg('muted', `  Active: ${this.sessions.length} sessions  ${updated}`), inner));
		}
		body.push(this.contentLine(this.theme.fg('dim', `  ${hLine(Math.max(0, inner - 2))}`), inner));
		body.push(this.contentLine(this.theme.bold('  Teams / Observers'), inner));

		if (this.sessions.length === 0 && !this.loadingList && !this.listError) {
			body.push(this.contentLine(this.theme.fg('muted', '  No active Hub sessions'), inner));
		} else if (!this.loadingList && !this.listError) {
			const listBudget = Math.max(1, contentBudget - body.length);
			const [start, end] = getVisibleRange(this.sessions.length, this.selectedIndex, listBudget);
			if (start > 0) {
				body.push(this.contentLine(this.theme.fg('dim', `  ↑ ${start} more above`), inner));
			}
			for (let i = start; i < end; i++) {
				const session = this.sessions[i]!;
				const selected = i === this.selectedIndex;
				const marker = selected ? this.theme.fg('accent', '›') : ' ';
				const label = session.label || shortId(session.sessionId);
				const name = selected ? this.theme.bold(label) : label;
				const statusColor =
					session.status === 'running' ? 'success'
						: session.status === 'error' || session.status === 'failed' ? 'error'
							: 'warning';
				const status = this.theme.fg(statusColor as 'success' | 'error' | 'warning', session.status);
				const self = this.currentSessionId === session.sessionId ? this.theme.fg('accent', ' (this)') : '';
				const metrics = this.theme.fg(
					'muted',
					`obs:${session.observerCount} agents:${session.subAgentCount} tasks:${session.taskCount} ${formatRelative(session.createdAt)}`,
				);
				body.push(this.contentLine(` ${marker} ${name}${self}  ${status} ${session.mode}  ${metrics}`, inner));
			}
			if (end < this.sessions.length) {
				body.push(this.contentLine(this.theme.fg('dim', `  ↓ ${this.sessions.length - end} more below`), inner));
			}
		}

		const windowedBody = body.slice(0, contentBudget);
		lines.push(...windowedBody);
		while (lines.length < maxLines - footerRows) {
			lines.push(this.contentLine('', inner));
		}

		lines.push(
			this.contentLine(
				this.theme.fg('dim', '  [↑↓] Select  [Enter] Open  [r] Refresh  [Esc] Close'),
				inner,
			),
		);
		lines.push(buildBottomBorder(width));
		return lines.slice(0, maxLines);
	}

	private renderDetailScreen(width: number, maxLines: number): string[] {
		const inner = Math.max(0, width - 2);
		const lines: string[] = [];
		const title = this.detail?.label || this.detailSessionId || 'Hub Session';
		const headerRows = 3;
		const footerRows = 2;
		const contentBudget = Math.max(5, maxLines - headerRows - footerRows);

		lines.push(buildTopBorder(width, `Session ${shortId(title)}`));
		lines.push(this.contentLine('', inner));
		lines.push(this.contentLine(this.buildTopTabs('detail', true), inner));

		const body: string[] = [];
		if (this.loadingDetail) {
			body.push(this.contentLine(this.theme.fg('dim', '  Loading session detail...'), inner));
		} else if (this.detailError) {
			body.push(this.contentLine(this.theme.fg('error', `  ${this.detailError}`), inner));
		} else if (!this.detail) {
			body.push(this.contentLine(this.theme.fg('muted', '  No detail available'), inner));
		} else {
			const session = this.detail;
			const participants = session.participants ?? [];
			const tasks = session.tasks ?? [];
			const activityEntries = Object.entries(session.agentActivity ?? {});

			body.push(this.contentLine(this.theme.bold('  Overview'), inner));
			body.push(this.contentLine(this.theme.fg('muted', `  ID: ${session.sessionId}`), inner));
			body.push(this.contentLine(this.theme.fg('muted', `  Status: ${session.status}  Mode: ${session.mode}`), inner));
			body.push(this.contentLine(this.theme.fg('muted', `  Created: ${formatRelative(session.createdAt)}`), inner));
			body.push(
				this.contentLine(
					this.theme.fg(
						'muted',
						`  Participants: ${participants.length}  Tasks: ${tasks.length}  Active agents: ${activityEntries.length}`,
					),
					inner,
				),
			);
			if (session.context?.branch) {
				body.push(this.contentLine(this.theme.fg('muted', `  Branch: ${session.context.branch}`), inner));
			}
			if (session.context?.workingDirectory) {
				body.push(this.contentLine(this.theme.fg('muted', `  CWD: ${session.context.workingDirectory}`), inner));
			}
			body.push(this.contentLine(this.theme.fg('dim', `  ${hLine(Math.max(0, inner - 2))}`), inner));
			body.push(this.contentLine(this.theme.bold('  Tasks'), inner));
			body.push(this.contentLine(this.theme.fg('dim', '  Use ↑ and ↓ to move, Enter to open task view'), inner));
			if (tasks.length === 0) {
				body.push(this.contentLine(this.theme.fg('dim', '  (no tasks yet)'), inner));
			} else {
				if (this.selectedTaskIndex >= tasks.length) {
					this.selectedTaskIndex = tasks.length - 1;
				}
				for (let i = 0; i < Math.min(tasks.length, 50); i++) {
					const task = tasks[i]!;
					const selected = i === this.selectedTaskIndex;
					const statusColor =
						task.status === 'completed' ? 'success'
							: task.status === 'failed' ? 'error'
								: 'warning';
					const status = this.theme.fg(statusColor as 'success' | 'error' | 'warning', task.status);
					const prompt = task.prompt ? truncateToWidth(toSingleLine(task.prompt), Math.max(16, inner - 34)) : '';
					const duration = typeof task.duration === 'number' ? ` ${task.duration}ms` : '';
					const marker = selected ? this.theme.fg('accent', '›') : ' ';
					body.push(
						this.contentLine(
							`${marker} ${shortId(task.taskId).padEnd(12)} ${task.agent.padEnd(9)} ${status}${duration} ${prompt}`,
							inner,
						),
					);
				}
			}

			body.push(this.contentLine(this.theme.fg('dim', `  ${hLine(Math.max(0, inner - 2))}`), inner));
			body.push(this.contentLine(this.theme.bold('  Session Todos'), inner));
			if (session.todosUnavailable) {
				body.push(this.contentLine(this.theme.fg('warning', `  ${session.todosUnavailable}`), inner));
			} else {
				const todos = session.todos ?? [];
				const summary = session.todoSummary ?? {};
				body.push(
					this.contentLine(
						this.theme.fg(
							'dim',
							`  open:${summary.open ?? 0} in_progress:${summary.in_progress ?? 0} done:${summary.done ?? 0} closed:${summary.closed ?? 0} cancelled:${summary.cancelled ?? 0}`,
						),
						inner,
					),
				);
				if (todos.length === 0) {
					body.push(
						this.contentLine(
							this.theme.fg('dim', `  (no todos linked to session ${shortId(session.sessionId)})`),
							inner,
						),
					);
				} else {
					for (const todo of todos.slice(0, 20)) {
						const statusColor =
							todo.status === 'done' ? 'success'
								: todo.status === 'cancelled' || todo.status === 'closed' ? 'error'
									: todo.status === 'in_progress' ? 'accent'
										: 'warning';
						const status = this.theme.fg(statusColor as 'success' | 'error' | 'warning' | 'accent', todo.status);
						const details = [
							typeof todo.priority === 'string' ? `prio:${todo.priority}` : undefined,
							typeof todo.type === 'string' ? `type:${todo.type}` : undefined,
							typeof todo.assignee === 'string' && todo.assignee.length > 0 ? `owner:${todo.assignee}` : undefined,
							typeof todo.attachmentCount === 'number' && todo.attachmentCount > 0
								? `att:${todo.attachmentCount}`
								: undefined,
						].filter((part): part is string => !!part);
						const title = truncateToWidth(toSingleLine(todo.title || ''), Math.max(16, inner - 48));
						const meta = details.length > 0 ? this.theme.fg('dim', ` ${details.join(' ')}`) : '';
						body.push(
							this.contentLine(
								`  ${shortId(todo.id).padEnd(12)} ${status} ${title}${meta}`,
								inner,
							),
						);
					}
					if (todos.length > 20) {
						body.push(this.contentLine(this.theme.fg('dim', `  ... ${todos.length - 20} more todos`), inner));
					}
				}
			}

			body.push(this.contentLine(this.theme.fg('dim', `  ${hLine(Math.max(0, inner - 2))}`), inner));
			body.push(this.contentLine(this.theme.bold('  Participants'), inner));
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
			body.push(this.contentLine(this.theme.bold('  Agent Activity'), inner));
			if (activityEntries.length === 0) {
				body.push(this.contentLine(this.theme.fg('dim', '  (none)'), inner));
			} else {
				for (const [agent, info] of activityEntries.slice(0, 15)) {
					const tool = info.currentTool ? ` ${info.currentTool}` : '';
					const calls =
						typeof info.toolCallCount === 'number'
							? this.theme.fg('dim', ` (${info.toolCallCount} calls)`)
							: '';
					const status = info.status || 'idle';
					body.push(this.contentLine(`  ${agent.padEnd(12)} ${status}${tool}${calls}`, inner));
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
				`${scrollInfo}  ${this.theme.fg('dim', '[↑↓] Task  [j/k] Scroll  [Enter] Open  [r] Refresh  [Esc] Back')}`,
				inner,
			),
		);
		lines.push(buildBottomBorder(width));
		return lines.slice(0, maxLines);
	}

	private renderFeedScreen(width: number, maxLines: number): string[] {
		const inner = Math.max(0, width - 2);
		const lines: string[] = [];
		const headerRows = 5;
		const footerRows = 2;
		const contentBudget = Math.max(5, maxLines - headerRows - footerRows);
		const scoped = this.feedScope === 'session' && !!this.detailSessionId;
		const title = scoped
			? `${this.feedViewMode === 'events' ? 'Session Events' : 'Session Feed'} ${shortId(this.getSessionLabel(this.detailSessionId!))}`
			: 'Global Feed';
		const entryBudget = Math.max(1, contentBudget - 2);
		const sessionBuffer = scoped && this.detailSessionId ? this.sessionBuffers.get(this.detailSessionId) : undefined;

		lines.push(buildTopBorder(width, title));
		lines.push(this.contentLine('', inner));
		lines.push(
			this.contentLine(
				this.buildTopTabs(
					scoped
						? (this.feedViewMode === 'events' ? 'events' : 'feed')
						: 'feed',
					scoped,
				),
				inner,
			),
		);
		lines.push(
			this.contentLine(
				this.theme.fg(
					'muted',
					scoped
						? (this.feedViewMode === 'stream'
								? '  Streaming rendered session output (sub-agent style) — [v] task stream'
								: '  Streaming full session events')
						: '  Streaming event summaries across all sessions',
				),
				inner,
			),
		);
		lines.push(this.contentLine(this.theme.fg('dim', `  ${hLine(Math.max(0, inner - 2))}`), inner));

		let contentLines: string[] = [];
		if (scoped && this.feedViewMode === 'stream') {
			contentLines = this.renderStreamLines(
				sessionBuffer?.output ?? '',
				sessionBuffer?.thinking ?? '',
				this.showFeedThinking,
				Math.max(12, inner - 4),
			);
			if (contentLines.length === 0) {
				contentLines = [this.theme.fg('dim', '(no streamed output yet)')];
			}
		} else {
			const entries = this.getFeedEntries(scoped ? 'session' : 'global');
			contentLines = [...entries]
				.reverse()
				.map((entry) => `${this.theme.fg('dim', formatClock(entry.at))} ${entry.text}`);
			if (contentLines.length === 0) {
				contentLines = [this.theme.fg('dim', '(no feed items yet)')];
			}
		}

		this.feedMaxScroll = Math.max(0, contentLines.length - entryBudget);
		if (this.feedFollowing) {
			this.feedScrollOffset = this.feedMaxScroll;
		}
		if (this.feedScrollOffset > this.feedMaxScroll) {
			this.feedScrollOffset = this.feedMaxScroll;
		}

		const windowed = contentLines.slice(this.feedScrollOffset, this.feedScrollOffset + entryBudget);
		for (const line of windowed) {
			lines.push(this.contentLine(`  ${line}`, inner));
		}
		while (lines.length < maxLines - footerRows) {
			lines.push(this.contentLine('', inner));
		}

		const scrollInfo = this.feedMaxScroll > 0
			? this.theme.fg('dim', `  scroll ${this.feedScrollOffset}/${this.feedMaxScroll}`)
			: this.theme.fg('dim', '  scroll 0/0');
		const thinkingHint = scoped && this.feedViewMode === 'stream' && sessionBuffer?.thinking ? '  [t] Thinking' : '';
		const taskHint = scoped && this.feedViewMode === 'stream' ? '  [v] Task view' : '';
		const followHint = `  [f] ${this.feedFollowing ? 'Unfollow' : 'Follow'}`;
		lines.push(
			this.contentLine(
				`${scrollInfo}  ${this.theme.fg('dim', `[↑↓] Scroll${thinkingHint}${taskHint}${followHint}  [r] Refresh  [Esc] Back`)}`,
				inner,
			),
		);
		lines.push(buildBottomBorder(width));
		return lines.slice(0, maxLines);
	}

	private renderTaskScreen(width: number, maxLines: number): string[] {
		const inner = Math.max(0, width - 2);
		const lines: string[] = [];
		const headerRows = 2;
		const footerRows = 2;
		const contentBudget = Math.max(5, maxLines - headerRows - footerRows);
		const tasks = this.getDetailTasks();
		const selected = tasks[this.selectedTaskIndex];
		const title = selected
			? `Task ${shortId(selected.taskId)} ${selected.agent}`
			: 'Task Detail';

		lines.push(buildTopBorder(width, title));
		lines.push(this.contentLine('', inner));

		const body: string[] = [];
		if (!selected) {
			body.push(this.contentLine(this.theme.fg('dim', '  No task selected'), inner));
		} else {
			body.push(this.contentLine(this.theme.bold('  Task Overview'), inner));
			body.push(this.contentLine(this.theme.fg('muted', `  Task ID: ${selected.taskId}`), inner));
			body.push(this.contentLine(this.theme.fg('muted', `  Agent: ${selected.agent}`), inner));
			body.push(this.contentLine(this.theme.fg('muted', `  Status: ${selected.status}`), inner));
			if (typeof selected.duration === 'number') {
				body.push(this.contentLine(this.theme.fg('muted', `  Duration: ${selected.duration}ms`), inner));
			}
			if (selected.startedAt) {
				body.push(this.contentLine(this.theme.fg('muted', `  Started: ${selected.startedAt}`), inner));
			}
			if (selected.completedAt) {
				body.push(this.contentLine(this.theme.fg('muted', `  Completed: ${selected.completedAt}`), inner));
			}
			body.push(this.contentLine(this.theme.fg('dim', `  ${hLine(Math.max(0, inner - 2))}`), inner));
			body.push(this.contentLine(this.theme.bold('  Prompt'), inner));

			const wrappedPrompt = wrapText(selected.prompt || '(no prompt recorded)', Math.max(10, inner - 4));
			for (const wrapped of wrappedPrompt) {
				body.push(this.contentLine(`  ${wrapped}`, inner));
			}
			body.push(this.contentLine(this.theme.fg('dim', `  ${hLine(Math.max(0, inner - 2))}`), inner));
			body.push(
				this.contentLine(
					this.theme.bold('  Task Output'),
					inner,
				),
			);

			const taskBuffer = this.detailSessionId
				? this.taskBuffers.get(this.getTaskFeedKey(this.detailSessionId, selected.taskId))
				: undefined;

			const rendered = this.renderStreamLines(
				taskBuffer?.output ?? '',
				taskBuffer?.thinking ?? '',
				this.showTaskThinking,
				Math.max(12, inner - 4),
			);
			if (rendered.length === 0) {
				body.push(
					this.contentLine(
						this.theme.fg('dim', '  (no task output yet)'),
						inner,
					),
				);
			} else {
				for (const line of rendered) {
					body.push(this.contentLine(`  ${line}`, inner));
				}
			}
		}

		this.taskMaxScroll = Math.max(0, body.length - contentBudget);
		if (this.taskFollowing) {
			this.taskScrollOffset = this.taskMaxScroll;
		}
		if (this.taskScrollOffset > this.taskMaxScroll) {
			this.taskScrollOffset = this.taskMaxScroll;
		}

		const windowedBody = body.slice(this.taskScrollOffset, this.taskScrollOffset + contentBudget);
		lines.push(...windowedBody);
		while (lines.length < maxLines - footerRows) {
			lines.push(this.contentLine('', inner));
		}

		const scrollInfo = this.taskMaxScroll > 0
			? this.theme.fg('dim', `  scroll ${this.taskScrollOffset}/${this.taskMaxScroll}`)
			: this.theme.fg('dim', '  scroll 0/0');
		const selectedTaskThinking = this.detailSessionId && selected
			? this.taskBuffers.get(this.getTaskFeedKey(this.detailSessionId, selected.taskId))?.thinking
			: '';
		const thinkingHint = selectedTaskThinking ? '  [t] Thinking' : '';
		const followHint = `  [f] ${this.taskFollowing ? 'Unfollow' : 'Follow'}`;
			lines.push(
				this.contentLine(
					`${scrollInfo}  ${this.theme.fg('dim', `[↑↓] Scroll  [[ and ]] Task${thinkingHint}${followHint}  [Esc] Back`)}`,
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
