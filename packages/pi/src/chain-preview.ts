import type { Theme } from '@mariozechner/pi-coding-agent';
import { matchesKey } from '@mariozechner/pi-tui';
import type { AgentDefinition } from './protocol.ts';
import { truncateToWidth } from './renderers.ts';

export interface ChainResult {
	mode: 'sequential' | 'parallel';
	steps: Array<{
		agent: string;
		task: string;
	}>;
}

interface Component {
	render(width: number): string[];
	handleInput?(data: string): void;
	invalidate(): void;
}

interface Focusable {
	focused: boolean;
}

interface ChainStep {
	agent: string;
	task: string;
}

type DoneFn = (result: ChainResult | undefined) => void;
type Mode = 'sequential' | 'parallel';
type ScreenMode = 'compose' | 'picker' | 'edit';

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

function parsePrintableChar(data: string): string | null {
	if (!data || data.length !== 1) return null;
	const code = data.charCodeAt(0);
	if (code < 32 || code === 127) return null;
	return data;
}

export class ChainEditorOverlay implements Component, Focusable {
	public focused = true;

	private readonly theme: Theme;
	private readonly done: DoneFn;
	private readonly agentByName: Map<string, AgentDefinition>;
	private readonly availableAgents: AgentDefinition[];

	private mode: Mode = 'sequential';
	private screen: ScreenMode = 'compose';
	private steps: ChainStep[];
	private selectedStepIndex = 0;
	private statusMessage = '';
	private readonly maxVisibleItems = 6;

	private pickerIndex = 0;
	private pickerFilter = '';

	private editBuffer = '';
	private editCursor = 0;
	private previousTask = '';

	private disposed = false;

	constructor(
		theme: Theme,
		agents: AgentDefinition[],
		done: DoneFn,
		initialAgents: string[] = [],
	) {
		this.theme = theme;
		this.done = done;
		this.availableAgents = [...agents];
		this.agentByName = new Map(agents.map((agent) => [agent.name, agent]));
		this.steps = this.buildInitialSteps(initialAgents);
	}

	handleInput(data: string): void {
		if (this.disposed) return;

		if (this.screen === 'picker') {
			this.handlePickerInput(data);
			return;
		}

		if (this.screen === 'edit') {
			this.handleEditInput(data);
			return;
		}

		this.handleComposeInput(data);
	}

	render(width: number): string[] {
		const safeWidth = Math.max(4, width);
		const lines = this.screen === 'picker'
			? this.renderPickerScreen(safeWidth)
			: this.renderComposeScreen(safeWidth);
		return lines.map((line) => truncateToWidth(line, safeWidth));
	}

	invalidate(): void {
		// Stateless rendering; no cache invalidation required.
	}

	dispose(): void {
		this.disposed = true;
	}

	private buildInitialSteps(initialAgents: string[]): ChainStep[] {
		const names = initialAgents
			.map((name) => name.trim())
			.filter((name) => name.length > 0)
			.filter((name) => this.agentByName.has(name));

		return names.map((agent, index) => ({
			agent,
			task: index === 0 ? '' : '(from previous step)',
		}));
	}

	private handleComposeInput(data: string): void {
		if (matchesKey(data, 'escape')) {
			this.close(undefined);
			return;
		}

		if (matchesKey(data, 'up')) {
			if (this.steps.length > 0) {
				this.selectedStepIndex = (this.selectedStepIndex - 1 + this.steps.length) % this.steps.length;
				this.statusMessage = '';
			}
			this.invalidate();
			return;
		}

		if (matchesKey(data, 'down')) {
			if (this.steps.length > 0) {
				this.selectedStepIndex = (this.selectedStepIndex + 1) % this.steps.length;
				this.statusMessage = '';
			}
			this.invalidate();
			return;
		}

		if (matchesKey(data, 'a') || data.toLowerCase() === 'a') {
			this.screen = 'picker';
			this.pickerFilter = '';
			this.pickerIndex = 0;
			this.statusMessage = '';
			this.invalidate();
			return;
		}

		if (matchesKey(data, 'd') || matchesKey(data, 'delete') || data.toLowerCase() === 'd') {
			if (this.steps.length > 0) {
				this.steps.splice(this.selectedStepIndex, 1);
				if (this.selectedStepIndex >= this.steps.length) {
					this.selectedStepIndex = Math.max(0, this.steps.length - 1);
				}
				this.statusMessage = '';
				this.invalidate();
			}
			return;
		}

		if (matchesKey(data, 'e') || data.toLowerCase() === 'e') {
			const selected = this.steps[this.selectedStepIndex];
			if (!selected) return;
			this.previousTask = selected.task;
			this.editBuffer = selected.task;
			this.editCursor = this.editBuffer.length;
			this.screen = 'edit';
			this.statusMessage = '';
			this.invalidate();
			return;
		}

		if (matchesKey(data, 'p') || data.toLowerCase() === 'p') {
			this.mode = this.mode === 'sequential' ? 'parallel' : 'sequential';
			this.statusMessage = '';
			this.invalidate();
			return;
		}

		if (matchesKey(data, 'enter')) {
			if (this.steps.length < 2) {
				this.statusMessage = 'Need at least 2 steps to run.';
				this.invalidate();
				return;
			}

			this.close({
				mode: this.mode,
				steps: this.steps.map((step) => ({
					agent: step.agent,
					task: step.task,
				})),
			});
		}
	}

	private handlePickerInput(data: string): void {
		if (matchesKey(data, 'escape')) {
			this.screen = 'compose';
			this.invalidate();
			return;
		}

		const filtered = this.getFilteredAgents();

		if (matchesKey(data, 'up')) {
			if (filtered.length > 0) {
				this.pickerIndex = (this.pickerIndex - 1 + filtered.length) % filtered.length;
			}
			this.invalidate();
			return;
		}

		if (matchesKey(data, 'down')) {
			if (filtered.length > 0) {
				this.pickerIndex = (this.pickerIndex + 1) % filtered.length;
			}
			this.invalidate();
			return;
		}

		if (matchesKey(data, 'backspace')) {
			if (this.pickerFilter.length > 0) {
				this.pickerFilter = this.pickerFilter.slice(0, -1);
				this.pickerIndex = 0;
				this.invalidate();
			}
			return;
		}

		if (matchesKey(data, 'enter')) {
			const selected = filtered[this.pickerIndex];
			if (!selected) return;

			this.steps.push({
				agent: selected.name,
				task: this.steps.length === 0 ? '' : '(from previous step)',
			});
			this.selectedStepIndex = this.steps.length - 1;
			this.screen = 'compose';
			this.statusMessage = '';
			this.invalidate();
			return;
		}

		const char = parsePrintableChar(data);
		if (char) {
			this.pickerFilter += char;
			this.pickerIndex = 0;
			this.invalidate();
		}
	}

	private handleEditInput(data: string): void {
		const selected = this.steps[this.selectedStepIndex];
		if (!selected) {
			this.screen = 'compose';
			return;
		}

		if (matchesKey(data, 'escape')) {
			selected.task = this.previousTask;
			this.screen = 'compose';
			this.invalidate();
			return;
		}

		if (matchesKey(data, 'enter')) {
			selected.task = this.editBuffer;
			this.screen = 'compose';
			this.invalidate();
			return;
		}

		if (matchesKey(data, 'left')) {
			this.editCursor = Math.max(0, this.editCursor - 1);
			this.invalidate();
			return;
		}

		if (matchesKey(data, 'right')) {
			this.editCursor = Math.min(this.editBuffer.length, this.editCursor + 1);
			this.invalidate();
			return;
		}

		if (matchesKey(data, 'home')) {
			this.editCursor = 0;
			this.invalidate();
			return;
		}

		if (matchesKey(data, 'end')) {
			this.editCursor = this.editBuffer.length;
			this.invalidate();
			return;
		}

		if (matchesKey(data, 'backspace')) {
			if (this.editCursor > 0) {
				this.editBuffer = this.editBuffer.slice(0, this.editCursor - 1) + this.editBuffer.slice(this.editCursor);
				this.editCursor -= 1;
				selected.task = this.editBuffer;
				this.invalidate();
			}
			return;
		}

		if (matchesKey(data, 'delete')) {
			if (this.editCursor < this.editBuffer.length) {
				this.editBuffer = this.editBuffer.slice(0, this.editCursor) + this.editBuffer.slice(this.editCursor + 1);
				selected.task = this.editBuffer;
				this.invalidate();
			}
			return;
		}

		const char = parsePrintableChar(data);
		if (char) {
			this.editBuffer = this.editBuffer.slice(0, this.editCursor) + char + this.editBuffer.slice(this.editCursor);
			this.editCursor += char.length;
			selected.task = this.editBuffer;
			this.invalidate();
		}
	}

	private getFilteredAgents(): AgentDefinition[] {
		const query = this.pickerFilter.trim().toLowerCase();
		if (!query) return this.availableAgents;
		return this.availableAgents.filter((agent) => {
			const haystack = `${agent.name} ${agent.description}`.toLowerCase();
			return haystack.includes(query);
		});
	}

	private renderComposeScreen(width: number): string[] {
		const inner = Math.max(0, width - 2);
		const lines: string[] = [];

		lines.push(buildTopBorder(width, 'Chain Editor'));
		lines.push(this.contentLine('', inner));

		const chainSummary = this.steps.length > 0
			? this.steps.map((step) => step.agent).join(' → ')
			: '(empty)';
		lines.push(this.contentLine(this.theme.fg('text', `  Chain: ${chainSummary}`), inner));
		lines.push(this.contentLine(this.theme.fg('muted', `  Mode: ${this.mode}`), inner));
		lines.push(this.contentLine('', inner));

		if (this.steps.length === 0) {
			lines.push(this.contentLine(this.theme.fg('muted', '  No steps yet. Press [a] to add an agent step.'), inner));
			lines.push(this.contentLine('', inner));
		} else {
			const [startIdx, endIdx] = this.getStepVisibleRange();

			if (startIdx > 0) {
				lines.push(this.contentLine(this.theme.fg('dim', `  ↑ ${startIdx} more above`), inner));
				lines.push(this.contentLine('', inner));
			}

			for (let i = startIdx; i < endIdx; i++) {
				const step = this.steps[i]!;
				const selected = i === this.selectedStepIndex;
				const marker = selected ? this.theme.fg('accent', '►') : ' ';
				const agent = this.agentByName.get(step.agent);
				const model = agent?.model ? this.theme.fg('dim', ` [${agent.model}]`) : '';

				lines.push(this.contentLine(`${marker} ${this.theme.bold(`Step ${i + 1}: ${step.agent}`)}${model}`, inner));

				if (this.screen === 'edit' && selected) {
					const displayTask = this.editBuffer.slice(0, this.editCursor) + this.theme.fg('accent', '│') + this.editBuffer.slice(this.editCursor);
					lines.push(this.contentLine(this.theme.fg('text', `  task: ${displayTask}`), inner));
					lines.push(this.contentLine(this.theme.fg('dim', '  editing: [Enter] Save  [Esc] Cancel  [←→] Move cursor'), inner));
				} else {
					const task = step.task || this.theme.fg('muted', '(empty)');
					lines.push(this.contentLine(this.theme.fg('text', `  task: ${task}`), inner));
				}

				lines.push(this.contentLine('', inner));
			}

			if (endIdx < this.steps.length) {
				lines.push(this.contentLine(this.theme.fg('dim', `  ↓ ${this.steps.length - endIdx} more below`), inner));
				lines.push(this.contentLine('', inner));
			}
		}

		if (this.statusMessage) {
			lines.push(this.contentLine(this.theme.fg('warning', `  ${this.statusMessage}`), inner));
			lines.push(this.contentLine('', inner));
		}

		const hintRun = this.steps.length >= 2
			? '[Enter] Run'
			: '[Enter] Run (needs 2+ steps)';
		lines.push(this.contentLine(this.theme.fg('dim', `  [↑↓] Navigate  [e] Edit task  [d] Remove`), inner));
		lines.push(this.contentLine(this.theme.fg('dim', `  [a] Add step  [p] Toggle mode  ${hintRun}  [Esc] Cancel`), inner));
		lines.push(buildBottomBorder(width));
		return lines;
	}

	private renderPickerScreen(width: number): string[] {
		const inner = Math.max(0, width - 2);
		const lines: string[] = [];
		const filtered = this.getFilteredAgents();

		if (this.pickerIndex >= filtered.length) {
			this.pickerIndex = Math.max(0, filtered.length - 1);
		}

		lines.push(buildTopBorder(width, 'Add Agent Step'));
		lines.push(this.contentLine('', inner));
		lines.push(this.contentLine(this.theme.fg('text', `  Filter: ${this.pickerFilter || '(type to filter)'}`), inner));
		lines.push(this.contentLine('', inner));

		if (filtered.length === 0) {
			lines.push(this.contentLine(this.theme.fg('muted', '  No agents match filter.'), inner));
			lines.push(this.contentLine('', inner));
		} else {
			const [startIdx, endIdx] = this.getPickerVisibleRange(filtered.length);

			if (startIdx > 0) {
				lines.push(this.contentLine(this.theme.fg('dim', `  ↑ ${startIdx} more above`), inner));
				lines.push(this.contentLine('', inner));
			}

			for (let i = startIdx; i < endIdx; i++) {
				const agent = filtered[i]!;
				const selected = i === this.pickerIndex;
				const marker = selected ? this.theme.fg('accent', '► ') : '  ';
				const model = agent.model ? this.theme.fg('dim', ` [${agent.model}]`) : '';
				lines.push(this.contentLine(`${marker}${this.theme.bold(agent.name)}${model}`, inner));
				lines.push(this.contentLine(this.theme.fg('muted', `   ${agent.description || ''}`), inner));
				lines.push(this.contentLine('', inner));
			}

			if (endIdx < filtered.length) {
				lines.push(this.contentLine(this.theme.fg('dim', `  ↓ ${filtered.length - endIdx} more below`), inner));
				lines.push(this.contentLine('', inner));
			}
		}

		lines.push(this.contentLine(this.theme.fg('dim', '  [↑↓] Navigate  [Enter] Select  [Esc] Back  [Backspace] Filter'), inner));
		lines.push(buildBottomBorder(width));
		return lines;
	}

	private contentLine(content: string, innerWidth: number): string {
		return `│${padRight(content, innerWidth)}│`;
	}

	private getStepVisibleRange(): [number, number] {
		const count = this.steps.length;
		if (count <= this.maxVisibleItems) return [0, count];

		const half = Math.floor(this.maxVisibleItems / 2);
		let start = Math.max(0, this.selectedStepIndex - half);
		let end = start + this.maxVisibleItems;

		if (end > count) {
			end = count;
			start = Math.max(0, end - this.maxVisibleItems);
		}

		return [start, end];
	}

	private getPickerVisibleRange(count: number): [number, number] {
		if (count <= this.maxVisibleItems) return [0, count];

		const half = Math.floor(this.maxVisibleItems / 2);
		let start = Math.max(0, this.pickerIndex - half);
		let end = start + this.maxVisibleItems;

		if (end > count) {
			end = count;
			start = Math.max(0, end - this.maxVisibleItems);
		}

		return [start, end];
	}

	private close(result: ChainResult | undefined): void {
		if (this.disposed) return;
		this.disposed = true;
		this.done(result);
	}
}
