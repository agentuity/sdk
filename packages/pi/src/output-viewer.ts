import { type Theme, getMarkdownTheme } from '@mariozechner/pi-coding-agent';
import { matchesKey, Markdown as MdComponent } from '@mariozechner/pi-tui';
import { truncateToWidth } from './renderers.ts';

export interface StoredResult {
	agentName: string;
	text: string;
	thinking: string; // Accumulated thinking tokens from streaming
	timestamp: number;
	tokenInfo?: string; // e.g. "scout: 1200ms | 500 in 800 out | $0.0123"
	description?: string; // Short 3-5 word task description
	prompt?: string; // Full detailed prompt sent to the agent
	isStreaming: boolean; // true while agent is still running
}

interface Component {
	render(width: number): string[];
	handleInput?(data: string): void;
	invalidate(): void;
}

interface Focusable {
	focused: boolean;
}

type DoneFn = (result: undefined) => void;

interface TUIRef {
	requestRender(): void;
}

const ANSI_RE = /\x1b\[[0-9;]*m/g;

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
	return width > 0 ? '\u2500'.repeat(width) : '';
}

function buildTopBorder(width: number, title: string): string {
	if (width <= 0) return '';
	if (width === 1) return '\u256D';
	if (width === 2) return '\u256D\u256E';

	const inner = width - 2;
	const titleText = ` ${title} `;
	if (titleText.length >= inner) {
		return `\u256D${hLine(inner)}\u256E`;
	}

	const left = Math.floor((inner - titleText.length) / 2);
	const right = inner - titleText.length - left;
	return `\u256D${hLine(left)}${titleText}${hLine(right)}\u256E`;
}

function buildBottomBorder(width: number): string {
	if (width <= 0) return '';
	if (width === 1) return '\u2570';
	if (width === 2) return '\u2570\u256F';
	return `\u2570${hLine(width - 2)}\u256F`;
}

export class OutputViewerOverlay implements Component, Focusable {
	public focused = true;

	private readonly tui: TUIRef;
	private readonly theme: Theme;
	private readonly results: StoredResult[];
	private readonly done: DoneFn;

	private currentIndex: number;
	private scrollOffset = 0;
	private disposed = false;
	private viewMode: 'output' | 'prompt' = 'output';
	private showThinking = false;
	private following = true;
	private pollTimer: ReturnType<typeof setInterval> | null = null;
	private mdRenderer: MdComponent | null = null;

	constructor(
		tui: TUIRef,
		theme: Theme,
		results: StoredResult[],
		done: DoneFn,
		startIndex?: number,
	) {
		this.tui = tui;
		this.theme = theme;
		this.results = results;
		this.done = done;
		this.currentIndex = startIndex ?? 0;

		// Initialize markdown renderer
		try {
			const mdTheme = getMarkdownTheme?.();
			if (mdTheme) {
				this.mdRenderer = new MdComponent('', 0, 0, mdTheme);
			}
		} catch {
			// Fallback: no markdown rendering
			this.mdRenderer = null;
		}

		// Poll for streaming updates — when viewing a streaming result, trigger re-renders
		this.pollTimer = setInterval(() => {
			if (this.disposed) return;
			const current = this.results[this.currentIndex];
			if (current?.isStreaming) {
				this.tui.requestRender();
			}
		}, 100);
	}

	handleInput(data: string): void {
		if (this.disposed) return;

		// Close overlay
		if (matchesKey(data, 'escape')) {
			this.close();
			return;
		}

		const result = this.results[this.currentIndex];
		if (!result) {
			this.close();
			return;
		}

		// Toggle thinking visibility
		if (matchesKey(data, 't') || data.toLowerCase() === 't') {
			if (result?.thinking) {
				this.showThinking = !this.showThinking;
				this.scrollOffset = 0;
				this.invalidate();
			}
			return;
		}

		// Toggle follow mode (auto-scroll)
		if (matchesKey(data, 'f') || data.toLowerCase() === 'f') {
			this.following = !this.following;
			if (this.following) {
				const lines = this.getContentLines();
				const budget = this.getContentBudget();
				this.scrollOffset = Math.max(0, lines.length - budget);
			}
			this.invalidate();
			return;
		}

		// Toggle between output and prompt views
		if (matchesKey(data, 'p') || data.toLowerCase() === 'p') {
			if (this.viewMode === 'output' && result?.prompt) {
				this.viewMode = 'prompt';
			} else {
				this.viewMode = 'output';
			}
			this.scrollOffset = 0;
			this.invalidate();
			return;
		}

		const contentLines = this.getContentLines();
		const contentBudget = this.getContentBudget();
		const maxScroll = Math.max(0, contentLines.length - contentBudget);
		const halfPage = Math.max(1, Math.floor(contentBudget / 2));

		// Vim: g = top, G = bottom
		if (data === 'g') {
			this.following = false;
			this.scrollOffset = 0;
			this.invalidate();
			return;
		}

		if (data === 'G') {
			this.following = false;
			this.scrollOffset = maxScroll;
			this.invalidate();
			return;
		}

		// Vim: { = jump back 25%, } = jump forward 25%
		if (data === '{') {
			this.following = false;
			const jump = Math.max(1, Math.floor(contentLines.length * 0.25));
			this.scrollOffset = Math.max(0, this.scrollOffset - jump);
			this.invalidate();
			return;
		}

		if (data === '}') {
			this.following = false;
			const jump = Math.max(1, Math.floor(contentLines.length * 0.25));
			this.scrollOffset = Math.min(maxScroll, this.scrollOffset + jump);
			this.invalidate();
			return;
		}

		// Navigate between results
		if (matchesKey(data, 'left')) {
			if (this.results.length > 1) {
				this.currentIndex = (this.currentIndex + 1) % this.results.length;
				this.scrollOffset = 0;
				this.viewMode = 'output';
				this.showThinking = false;
				this.invalidate();
			}
			return;
		}

		if (matchesKey(data, 'right')) {
			if (this.results.length > 1) {
				this.currentIndex = (this.currentIndex - 1 + this.results.length) % this.results.length;
				this.scrollOffset = 0;
				this.viewMode = 'output';
				this.showThinking = false;
				this.invalidate();
			}
			return;
		}

		// Scroll content — manual scroll disables following
		if (matchesKey(data, 'up')) {
			if (this.scrollOffset > 0) {
				this.following = false;
				this.scrollOffset -= 1;
				this.invalidate();
			}
			return;
		}

		if (matchesKey(data, 'down')) {
			if (this.scrollOffset < maxScroll) {
				this.following = false;
				this.scrollOffset += 1;
				this.invalidate();
			}
			return;
		}

		// Page up (Shift+Up or PageUp)
		if (matchesKey(data, 'shift+up') || matchesKey(data, 'pageUp')) {
			this.following = false;
			this.scrollOffset = Math.max(0, this.scrollOffset - halfPage);
			this.invalidate();
			return;
		}

		// Page down (Shift+Down or PageDown)
		if (matchesKey(data, 'shift+down') || matchesKey(data, 'pageDown')) {
			this.following = false;
			this.scrollOffset = Math.min(maxScroll, this.scrollOffset + halfPage);
			this.invalidate();
			return;
		}

		// Home — jump to top
		if (matchesKey(data, 'home')) {
			this.following = false;
			this.scrollOffset = 0;
			this.invalidate();
			return;
		}

		// End — jump to bottom
		if (matchesKey(data, 'end')) {
			this.following = false;
			this.scrollOffset = maxScroll;
			this.invalidate();
			return;
		}
	}

	render(width: number): string[] {
		const safeWidth = Math.max(4, width);
		const inner = Math.max(0, safeWidth - 2);
		const termHeight = process.stdout.rows || 40;
		// Match overlay maxHeight of 95%, leave margin for overlay chrome
		const maxLines = Math.max(10, Math.floor(termHeight * 0.95) - 2);

		const result = this.results[this.currentIndex];
		if (!result) {
			const lines = [
				buildTopBorder(safeWidth, 'Output Viewer'),
				this.contentLine(this.theme.fg('muted', '  No results available'), inner),
				this.contentLine(this.theme.fg('dim', '  [Esc] Close'), inner),
				buildBottomBorder(safeWidth),
			];
			return lines.map((line) => truncateToWidth(line, safeWidth));
		}

		// Build header title with streaming indicator
		const streamLabel = result.isStreaming ? ' LIVE' : '';
		const nameLabel = result.description
			? `${result.agentName} - ${result.description}`
			: result.agentName;
		const posLabel = this.results.length > 1
			? `${nameLabel}${streamLabel} (${this.currentIndex + 1} of ${this.results.length})`
			: `${nameLabel}${streamLabel}`;
		const titleLabel = this.viewMode === 'prompt' ? `${posLabel} [PROMPT]` : posLabel;

		const header: string[] = [
			buildTopBorder(safeWidth, titleLabel),
		];

		// Sub-header: token info or prompt-mode indicator
		if (this.viewMode === 'prompt') {
			header.push(this.contentLine(this.theme.fg('dim', '   Prompt sent to agent:'), inner));
		} else if (result.tokenInfo) {
			header.push(this.contentLine(this.theme.fg('dim', `   ${result.tokenInfo}`), inner));
		} else {
			header.push(this.contentLine('', inner));
		}
		header.push(this.contentLine('', inner)); // padding line after header

		// Footer with position indicator and new hints
		const thinkingHint = result.thinking ? `[t] ${this.showThinking ? 'Hide' : 'Show'} thinking  ` : '';
		const followHint = result.isStreaming ? `[f] ${this.following ? 'Unfollow' : 'Follow'}  ` : '';
		const promptHint = result.prompt ? '[p] Prompt  ' : '';
		const navHint = this.results.length > 1 ? '[<- ->] Switch  ' : '';

		// Content assembly via helper
		const contentLines = this.getContentLines();
		const totalLines = contentLines.length;

		// Content area
		const contentBudget = Math.max(1, maxLines - header.length - 2); // 2 = footer lines

		// Auto-follow when streaming
		if (this.following && result.isStreaming) {
			this.scrollOffset = Math.max(0, totalLines - contentBudget);
		}

		const maxScroll = Math.max(0, totalLines - contentBudget);

		// Clamp scroll offset
		if (this.scrollOffset > maxScroll) {
			this.scrollOffset = maxScroll;
		}

		// Position indicator
		const currentLine = Math.min(this.scrollOffset + 1, totalLines);
		const pct = totalLines > 0 ? Math.round((currentLine / totalLines) * 100) : 0;
		const posInfo = totalLines > 0 ? `L${currentLine}/${totalLines} ${pct}%  ` : '';

		const vimHint = totalLines > contentBudget ? '[g/G] Top/Bot  [{/}] Jump  ' : '';
		const footer: string[] = [
			this.contentLine(this.theme.fg('dim', `   ${posInfo}${vimHint}[Up/Dn] Scroll  ${thinkingHint}${followHint}${promptHint}${navHint}[Esc] Close`), inner),
			buildBottomBorder(safeWidth),
		];

		const content: string[] = [];

		// Scroll indicator: above
		const aboveCount = this.scrollOffset;
		if (aboveCount > 0) {
			content.push(this.contentLine(this.theme.fg('dim', `   ^ ${aboveCount} more above`), inner));
		}

		// Visible lines
		const visibleBudget = aboveCount > 0
			? contentBudget - 1 // reserve 1 line for "above" indicator
			: contentBudget;
		const belowCount = totalLines - this.scrollOffset - visibleBudget;
		const actualVisible = belowCount > 0 ? visibleBudget - 1 : visibleBudget; // reserve 1 for "below"

		const sliceEnd = Math.min(this.scrollOffset + actualVisible, totalLines);
		for (let i = this.scrollOffset; i < sliceEnd; i++) {
			const line = contentLines[i] ?? '';
			content.push(this.contentLine('   ' + truncateToWidth(line, Math.max(0, inner - 3)), inner));
		}

		// Scroll indicator: below
		const remainingBelow = totalLines - sliceEnd;
		if (remainingBelow > 0) {
			content.push(this.contentLine(this.theme.fg('dim', `   v ${remainingBelow} more below`), inner));
		}

		const lines = [...header, ...content, ...footer];
		return lines.map((line) => truncateToWidth(line, safeWidth));
	}

	invalidate(): void {
		// Stateless rendering; no cache invalidation required.
	}

	dispose(): void {
		this.disposed = true;
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
	}

	private getContentLines(): string[] {
		const result = this.results[this.currentIndex];
		if (!result) return [];

		const lines: string[] = [];

		// Thinking section (dimmed) — keep as plain text, it's raw thinking
		if (this.showThinking && result.thinking) {
			const thinkingLines = result.thinking.split('\n');
			for (const line of thinkingLines) {
				lines.push(this.theme.fg('dim', line));
			}
			lines.push(this.theme.fg('muted', '--- end thinking ---'));
			lines.push(''); // empty line separator
		}

		// Main content — render as markdown for syntax highlighting
		const mainText = this.viewMode === 'prompt' && result.prompt ? result.prompt : result.text;
		if (mainText) {
			if (this.mdRenderer) {
				try {
					this.mdRenderer.setText(mainText);
					// Render with inner width minus padding (3 spaces left + border chars)
					const termWidth = Math.max(20, (process.stdout.columns || 80) - 10);
					const rendered = this.mdRenderer.render(termWidth);
					lines.push(...rendered);
				} catch {
					// Fallback: plain text if markdown rendering fails
					lines.push(...mainText.split('\n'));
				}
			} else {
				// Fallback: plain text
				lines.push(...mainText.split('\n'));
			}
		}

		return lines;
	}

	private getContentBudget(): number {
		const termHeight = process.stdout.rows || 40;
		const maxLines = Math.max(10, Math.floor(termHeight * 0.95) - 2);
		return Math.max(1, maxLines - 4); // 4 = header + footer lines
	}

	private contentLine(content: string, innerWidth: number): string {
		return `\u2502${padRight(content, innerWidth)}\u2502`;
	}

	private close(): void {
		if (this.disposed) return;
		this.disposed = true;
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
		this.done(undefined);
	}
}
