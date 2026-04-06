import type { Theme } from '@mariozechner/pi-coding-agent';
import { matchesKey } from '@mariozechner/pi-tui';
import type { AgentDefinition } from './protocol.ts';
import { truncateToWidth } from './renderers.ts';

export interface AgentManagerResult {
	agent: string;
	action: 'run';
}

interface Component {
	render(width: number): string[];
	handleInput?(data: string): void;
	invalidate(): void;
}

interface Focusable {
	focused: boolean;
}

type DoneFn = (result: AgentManagerResult | undefined) => void;
type Screen = 'list' | 'detail';

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI SGR escape sequences for terminal colors/styles
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
	return width > 0 ? '─'.repeat(width) : '';
}

function buildTopBorder(width: number, title: string): string {
	if (width <= 0) return '';
	if (width === 1) return '╭';
	if (width === 2) return '╭╮';

	const inner = width - 2;
	const titleText = ` ${title} `;
	if (titleText.length >= inner) {
		return `╭${hLine(inner)}╮`;
	}

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

export class AgentManagerOverlay implements Component, Focusable {
	public focused = true;

	private readonly theme: Theme;
	private readonly agents: AgentDefinition[];
	private readonly done: DoneFn;

	private screen: Screen = 'list';
	private selectedIndex = 0;
	private readonly listWindowSize = 6;
	private disposed = false;

	constructor(theme: Theme, agents: AgentDefinition[], done: DoneFn) {
		this.theme = theme;
		this.agents = agents;
		this.done = done;
	}

	handleInput(data: string): void {
		if (this.disposed) return;

		if (matchesKey(data, 'escape')) {
			if (this.screen === 'detail') {
				this.screen = 'list';
				this.invalidate();
				return;
			}
			this.close(undefined);
			return;
		}

		if (this.screen === 'list') {
			this.handleListInput(data);
			return;
		}

		this.handleDetailInput(data);
	}

	render(width: number): string[] {
		const safeWidth = Math.max(4, width);
		const termHeight = process.stdout.rows || 40;
		// Match overlay maxHeight of 95%, leave margin for overlay chrome
		const maxLines = Math.max(10, Math.floor(termHeight * 0.95) - 2);

		const lines =
			this.screen === 'detail'
				? this.renderDetailScreen(safeWidth)
				: this.renderListScreen(safeWidth, maxLines);
		return lines.map((line) => truncateToWidth(line, safeWidth));
	}

	invalidate(): void {
		// Stateless rendering; no cache invalidation required.
	}

	dispose(): void {
		this.disposed = true;
	}

	private handleListInput(data: string): void {
		const count = this.agents.length;
		if (count === 0) return;

		if (matchesKey(data, 'up')) {
			this.selectedIndex = (this.selectedIndex - 1 + count) % count;
			this.invalidate();
			return;
		}

		if (matchesKey(data, 'down')) {
			this.selectedIndex = (this.selectedIndex + 1) % count;
			this.invalidate();
			return;
		}

		if (matchesKey(data, 'enter')) {
			this.screen = 'detail';
			this.invalidate();
		}
	}

	private handleDetailInput(data: string): void {
		if (matchesKey(data, 'r') || data.toLowerCase() === 'r') {
			const selected = this.agents[this.selectedIndex];
			if (!selected) return;
			this.close({ action: 'run', agent: selected.name });
		}
	}

	private close(result: AgentManagerResult | undefined): void {
		if (this.disposed) return;
		this.disposed = true;
		this.done(result);
	}

	private renderListScreen(width: number, maxLines: number): string[] {
		const inner = Math.max(0, width - 2);

		// Fixed header (always rendered)
		const header: string[] = [
			buildTopBorder(width, 'Agent Manager'),
			this.contentLine('', inner),
		];

		// Fixed footer (always rendered)
		const footer: string[] = [
			this.contentLine(
				this.theme.fg('dim', '  [↑↓] Navigate  [Enter] Details  [Esc] Close'),
				inner
			),
			buildBottomBorder(width),
		];

		// Available lines for scrollable content area
		const contentBudget = Math.max(4, maxLines - header.length - footer.length);

		if (this.agents.length === 0) {
			const content = [
				this.contentLine(this.theme.fg('muted', '  No agents available'), inner),
				this.contentLine('', inner),
			];
			return [...header, ...content, ...footer];
		}

		// Each agent takes 4 lines: name, description, capabilities, empty line
		const LINES_PER_AGENT = 4;
		// Reserve 2 lines for possible scroll indicators
		const scrollReserve = 2;
		const maxAgents = Math.max(1, Math.floor((contentBudget - scrollReserve) / LINES_PER_AGENT));

		// Dynamic window size based on available space
		const windowSize = Math.min(maxAgents, this.agents.length);
		const [start, end] = this.getVisibleRange(windowSize);

		const content: string[] = [];

		if (start > 0) {
			content.push(this.contentLine(this.theme.fg('dim', `  ↑ ${start} more above`), inner));
		}

		for (let i = start; i < end; i++) {
			const agent = this.agents[i]!;
			const selected = i === this.selectedIndex;
			const prefix = selected ? this.theme.fg('accent', '› ') : '  ';

			const model = agent.model ? this.theme.fg('dim', ` [${agent.model}]`) : '';
			const readOnly = agent.readOnly ? this.theme.fg('warning', ' read-only') : '';
			const title = `${prefix}${this.theme.bold(agent.name)}${model}${readOnly}`;
			content.push(this.contentLine(title, inner));

			const description = this.theme.fg('text', `  ${agent.description || 'No description'}`);
			content.push(this.contentLine(description, inner));

			const capsText = agent.capabilities?.length ? agent.capabilities.join(', ') : 'none';
			const caps = this.theme.fg('muted', `  capabilities: ${capsText}`);
			content.push(this.contentLine(caps, inner));

			content.push(this.contentLine('', inner));
		}

		if (end < this.agents.length) {
			content.push(
				this.contentLine(
					this.theme.fg('dim', `  ↓ ${this.agents.length - end} more below`),
					inner
				)
			);
		}

		return [...header, ...content, ...footer];
	}

	private renderDetailScreen(width: number): string[] {
		const inner = Math.max(0, width - 2);
		const lines: string[] = [];
		const agent = this.agents[this.selectedIndex];

		lines.push(buildTopBorder(width, agent?.name || 'Agent'));
		lines.push(this.contentLine('', inner));

		if (!agent) {
			lines.push(this.contentLine(this.theme.fg('error', '  Agent not found'), inner));
			lines.push(this.contentLine('', inner));
			lines.push(this.contentLine(this.theme.fg('dim', '  [Esc] Back'), inner));
			lines.push(buildBottomBorder(width));
			return lines;
		}

		const readOnly = agent.readOnly ? 'yes' : 'no';
		const capabilities = agent.capabilities?.length ? agent.capabilities.join(', ') : 'none';
		const status = agent.status || 'idle';

		lines.push(this.fieldLine('Model', agent.model || 'default', inner));
		lines.push(this.fieldLine('Read-only', readOnly, inner));
		lines.push(this.fieldLine('Description', agent.description || 'No description', inner));
		lines.push(this.fieldLine('Capabilities', capabilities, inner));
		lines.push(this.fieldLine('Status', status, inner));
		lines.push(this.contentLine('', inner));
		lines.push(this.contentLine(this.theme.fg('dim', '  [r] Run agent  [Esc] Back'), inner));
		lines.push(buildBottomBorder(width));
		return lines;
	}

	private fieldLine(label: string, value: string, innerWidth: number): string {
		const labelText = this.theme.fg('dim', `  ${label}:`);
		const content = `${labelText} ${this.theme.fg('text', value)}`;
		return this.contentLine(content, innerWidth);
	}

	private contentLine(content: string, innerWidth: number): string {
		return `│${padRight(content, innerWidth)}│`;
	}

	private getVisibleRange(windowSize?: number): [number, number] {
		const count = this.agents.length;
		const ws = windowSize ?? this.listWindowSize;
		if (count <= ws) return [0, count];

		const half = Math.floor(ws / 2);
		let start = Math.max(0, this.selectedIndex - half);
		let end = start + ws;

		if (end > count) {
			end = count;
			start = Math.max(0, end - ws);
		}

		return [start, end];
	}
}
