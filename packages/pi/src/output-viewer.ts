import type { Theme } from '@mariozechner/pi-coding-agent';
import { matchesKey } from '@mariozechner/pi-tui';
import { truncateToWidth } from './renderers.ts';

export interface StoredResult {
	agentName: string;
	text: string;
	timestamp: number;
	tokenInfo?: string; // e.g. "scout: 1200ms | 500 in 800 out | $0.0123"
	description?: string; // Short 3-5 word task description
	prompt?: string; // Full detailed prompt sent to the agent
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

	private readonly theme: Theme;
	private readonly results: StoredResult[];
	private readonly done: DoneFn;

	private currentIndex: number;
	private scrollOffset = 0;
	private disposed = false;
	private viewMode: 'output' | 'prompt' = 'output';

	constructor(
		theme: Theme,
		results: StoredResult[],
		done: DoneFn,
		startIndex?: number,
	) {
		this.theme = theme;
		this.results = results;
		this.done = done;
		this.currentIndex = startIndex ?? 0;
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

		const activeText = this.viewMode === 'prompt' && result.prompt ? result.prompt : result.text;
		const contentLines = activeText.split('\n');
		const termHeight = process.stdout.rows || 40;
		const maxLines = Math.max(10, Math.floor(termHeight * 0.8) - 2);
		// header=2 lines, footer=2 lines
		const contentBudget = Math.max(1, maxLines - 4);
		const maxScroll = Math.max(0, contentLines.length - contentBudget);
		const halfPage = Math.max(1, Math.floor(contentBudget / 2));

		// Navigate between results
		if (matchesKey(data, 'left')) {
			if (this.results.length > 1) {
				this.currentIndex = (this.currentIndex + 1) % this.results.length;
				this.scrollOffset = 0;
				this.viewMode = 'output';
				this.invalidate();
			}
			return;
		}

		if (matchesKey(data, 'right')) {
			if (this.results.length > 1) {
				this.currentIndex = (this.currentIndex - 1 + this.results.length) % this.results.length;
				this.scrollOffset = 0;
				this.viewMode = 'output';
				this.invalidate();
			}
			return;
		}

		// Scroll content
		if (matchesKey(data, 'up')) {
			if (this.scrollOffset > 0) {
				this.scrollOffset -= 1;
				this.invalidate();
			}
			return;
		}

		if (matchesKey(data, 'down')) {
			if (this.scrollOffset < maxScroll) {
				this.scrollOffset += 1;
				this.invalidate();
			}
			return;
		}

		// Page up (Shift+Up or PageUp)
		if (matchesKey(data, 'shift+up') || matchesKey(data, 'pageUp')) {
			this.scrollOffset = Math.max(0, this.scrollOffset - halfPage);
			this.invalidate();
			return;
		}

		// Page down (Shift+Down or PageDown)
		if (matchesKey(data, 'shift+down') || matchesKey(data, 'pageDown')) {
			this.scrollOffset = Math.min(maxScroll, this.scrollOffset + halfPage);
			this.invalidate();
			return;
		}

		// Home — jump to top
		if (matchesKey(data, 'home')) {
			this.scrollOffset = 0;
			this.invalidate();
			return;
		}

		// End — jump to bottom
		if (matchesKey(data, 'end')) {
			this.scrollOffset = maxScroll;
			this.invalidate();
			return;
		}
	}

	render(width: number): string[] {
		const safeWidth = Math.max(4, width);
		const inner = Math.max(0, safeWidth - 2);
		const termHeight = process.stdout.rows || 40;
		// Match overlay maxHeight of 80%, leave margin for overlay chrome
		const maxLines = Math.max(10, Math.floor(termHeight * 0.8) - 2);

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

		// Build header title: "agentName - description (N of M)" or "agentName (N of M)"
		const nameLabel = result.description
			? `${result.agentName} - ${result.description}`
			: result.agentName;
		const posLabel = this.results.length > 1
			? `${nameLabel} (${this.currentIndex + 1} of ${this.results.length})`
			: nameLabel;
		const titleLabel = this.viewMode === 'prompt' ? `${posLabel} [PROMPT]` : posLabel;

		const header: string[] = [
			buildTopBorder(safeWidth, titleLabel),
		];

		// Sub-header: token info or prompt-mode indicator
		if (this.viewMode === 'prompt') {
			header.push(this.contentLine(this.theme.fg('dim', '  Prompt sent to agent:'), inner));
		} else if (result.tokenInfo) {
			header.push(this.contentLine(this.theme.fg('dim', `  ${result.tokenInfo}`), inner));
		} else {
			header.push(this.contentLine('', inner));
		}

		// Footer
		const navHint = this.results.length > 1 ? '[<- ->] Switch agent  ' : '';
		const promptHint = result.prompt ? '[p] Prompt  ' : '';
		const footer: string[] = [
			this.contentLine(this.theme.fg('dim', `  [Up/Down] Scroll  [PgUp/PgDn] Page  ${promptHint}${navHint}[Esc] Close`), inner),
			buildBottomBorder(safeWidth),
		];

		// Content area — switch between output and prompt based on viewMode
		const contentBudget = Math.max(1, maxLines - header.length - footer.length);
		const activeText = this.viewMode === 'prompt' && result.prompt
			? result.prompt
			: result.text;
		const contentLines = activeText.split('\n');
		const totalLines = contentLines.length;
		const maxScroll = Math.max(0, totalLines - contentBudget);

		// Clamp scroll offset
		if (this.scrollOffset > maxScroll) {
			this.scrollOffset = maxScroll;
		}

		const content: string[] = [];

		// Scroll indicator: above
		const aboveCount = this.scrollOffset;
		if (aboveCount > 0) {
			content.push(this.contentLine(this.theme.fg('dim', `  ^ ${aboveCount} more above`), inner));
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
			content.push(this.contentLine('  ' + truncateToWidth(line, Math.max(0, inner - 2)), inner));
		}

		// Scroll indicator: below
		const remainingBelow = totalLines - sliceEnd;
		if (remainingBelow > 0) {
			content.push(this.contentLine(this.theme.fg('dim', `  v ${remainingBelow} more below`), inner));
		}

		const lines = [...header, ...content, ...footer];
		return lines.map((line) => truncateToWidth(line, safeWidth));
	}

	invalidate(): void {
		// Stateless rendering; no cache invalidation required.
	}

	dispose(): void {
		this.disposed = true;
	}

	private contentLine(content: string, innerWidth: number): string {
		return `\u2502${padRight(content, innerWidth)}\u2502`;
	}

	private close(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.done(undefined);
	}
}
