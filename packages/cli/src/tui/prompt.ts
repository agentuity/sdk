/**
 * Interactive prompt system for TUI
 */
import * as readline from 'node:readline';
import { symbols } from './symbols';
import { colors } from './colors';

interface KeypressEvent {
	name: string;
	ctrl?: boolean;
}

export interface TextOptions {
	message: string;
	initial?: string;
	placeholder?: string;
	validate?: (value: string) => boolean | string | Promise<boolean | string>;
}

export interface ConfirmOptions {
	message: string;
	initial?: boolean;
}

export interface SelectOption<T = string> {
	value: T;
	label: string;
	hint?: string;
}

export interface SelectOptions<T = string> {
	message: string;
	options: SelectOption<T>[];
	initial?: T;
}

export interface MultiSelectOptions<T = string> {
	message: string;
	options: SelectOption<T>[];
	initial?: T[];
}

/**
 * Prompt state tracking
 */
interface PromptState {
	type: 'active' | 'completed' | 'error' | 'cancelled';
	message: string;
	value?: unknown;
}

/**
 * Main prompt flow class
 */
export class PromptFlow {
	private states: PromptState[] = [];
	private hasIntro = false;

	/**
	 * Display intro banner
	 */
	intro(title: string): void {
		console.log(`${colors.secondary(symbols.squareTL)}   ${colors.inverseCyan(` ⨺ ${title} `)}`);
		console.log(colors.secondary(symbols.bar));
		this.hasIntro = true;
	}

	/**
	 * Display outro message
	 */
	outro(...messages: string[]): void {
		for (const message of messages) {
			console.log(colors.secondary(symbols.bar));
			console.log(`${colors.secondary(symbols.squareBL)}  ${message}`);
		}
		console.log();

		// Ensure stdin is properly closed
		if (process.stdin.isTTY) {
			process.stdin.pause();
			process.stdin.setRawMode(false);
		}
	}

	/**
	 * Text input prompt
	 */
	async text(options: TextOptions): Promise<string> {
		const { message, initial = '', validate } = options;

		return new Promise((resolve, reject) => {
			const rl = readline.createInterface({
				input: process.stdin,
				output: process.stdout,
			});

			let hasError = false;

			const showPrompt = () => {
				// Show prompt with active symbol
				process.stdout.write(
					`${colors.active(symbols.active)}  ${message}\n${colors.secondary(symbols.bar)}  `
				);
			};

			showPrompt();

			rl.on('line', async (input) => {
				const trimmed = input.trim();
				const value = trimmed.length > 0 ? trimmed : initial;

				// Validate
				if (validate) {
					try {
						const result = await validate(value);
						if (result !== true) {
							const errorMsg = typeof result === 'string' ? result : 'Invalid input';
							
							// Clear all previous lines (prompt + optional error)
							const linesToClear = hasError ? 3 : 2;
							readline.moveCursor(process.stdout, 0, -linesToClear);
							readline.clearScreenDown(process.stdout);
							
							// Redraw prompt with error
							process.stdout.write(
								`${colors.error(symbols.error)}  ${message}\n${colors.secondary(symbols.bar)}  ${colors.error(errorMsg)}\n${colors.secondary(symbols.bar)}  `
							);
							hasError = true;
							return;
						}
					} catch (error) {
						// Handle validation errors
						const errorMsg = error instanceof Error ? error.message : 'Validation failed';
						
						// Clear all previous lines
						const linesToClear = hasError ? 3 : 2;
						readline.moveCursor(process.stdout, 0, -linesToClear);
						readline.clearScreenDown(process.stdout);
						
						// Show error and cleanup
						process.stdout.write(
							`${colors.error(symbols.error)}  ${message}\n${colors.secondary(symbols.bar)}  ${colors.error(errorMsg)}\n`
						);
						
						rl.close();
						if (process.stdin.isTTY) {
							process.stdin.pause();
						}
						
						reject(error);
						return;
					}
				}

				// Clear all lines and show completed state
				const linesToClear = hasError ? 3 : 2;
				readline.moveCursor(process.stdout, 0, -linesToClear);
				readline.clearScreenDown(process.stdout);

				process.stdout.write(
					`${colors.completed(symbols.completed)}  ${message}\n${colors.secondary(symbols.bar)}  ${colors.muted(value)}\n${colors.secondary(symbols.bar)}\n`
				);

				this.states.push({
					type: 'completed',
					message,
					value,
				});

				rl.close();

				// Important: pause stdin so next prompt can use it
				if (process.stdin.isTTY) {
					process.stdin.pause();
				}

				resolve(value);
			});

			rl.on('SIGINT', () => {
				rl.close();
				console.log('\n');
				this.cancel('Operation cancelled');
				reject(new Error('User cancelled'));
			});
		});
	}

	/**
	 * Confirm (yes/no) prompt
	 */
	async confirm(options: ConfirmOptions): Promise<boolean> {
		const { message, initial = false } = options;

		return new Promise((resolve, reject) => {
			const hint = initial ? 'Y/n' : 'y/N';

			// Resume stdin if it was paused
			if (process.stdin.isTTY && process.stdin.isPaused()) {
				process.stdin.resume();
			}

			// Hide cursor
			if (process.stdout.isTTY) {
				process.stdout.write('\x1b[?25l');
			}

			process.stdout.write(
				`${colors.active(symbols.active)}  ${message} ${colors.muted(`(${hint})`)} `
			);

			readline.emitKeypressEvents(process.stdin);
			if (process.stdin.isTTY) {
				process.stdin.setRawMode(true);
			}

			const onKeypress = (str: string, key: KeypressEvent) => {
				const normalized = (str || '').toLowerCase();
				let value = initial;

				// Check for y/n keypress
				if (normalized === 'y') {
					value = true;
				} else if (normalized === 'n') {
					value = false;
				} else if (key.name === 'return') {
					// Enter key uses default
					value = initial;
				} else if (key.ctrl && key.name === 'c') {
					cleanup();
					console.log('\n');
					this.cancel('Operation cancelled');
					reject(new Error('User cancelled'));
					return;
				} else {
					// Ignore other keys
					return;
				}

				cleanup();

				// Clear the line and show completed state
				readline.cursorTo(process.stdout, 0);
				readline.clearLine(process.stdout, 0);

				const displayValue = value ? 'Yes' : 'No';
				process.stdout.write(
					`${colors.completed(symbols.completed)}  ${message}\n${colors.secondary(symbols.bar)}  ${colors.muted(displayValue)}\n${colors.secondary(symbols.bar)}\n`
				);

				this.states.push({
					type: 'completed',
					message,
					value,
				});

				resolve(value);
			};

			const cleanup = () => {
				process.stdin.removeListener('keypress', onKeypress);
				if (process.stdin.isTTY) {
					process.stdin.setRawMode(false);
					// Show cursor again
					process.stdout.write('\x1b[?25h');
				}
			};

			process.stdin.on('keypress', onKeypress);
		});
	}

	/**
	 * Select (single choice) prompt
	 */
	async select<T = string>(options: SelectOptions<T>): Promise<T> {
		const { message, options: choices, initial } = options;

		return new Promise((resolve, reject) => {
			let selectedIndex = choices.findIndex((c) => c.value === initial);
			if (selectedIndex === -1) selectedIndex = 0;

			let hasRendered = false;

			const render = () => {
				// Clear previous render
				if (hasRendered && process.stdout.isTTY) {
					// Move cursor up to the start of the prompt (message + all choices)
					const totalLines = choices.length + 1;
					readline.moveCursor(process.stdout, 0, -totalLines);
					readline.cursorTo(process.stdout, 0);
					readline.clearScreenDown(process.stdout);
				}

				process.stdout.write(`${colors.active(symbols.active)}  ${message}\n`);

				choices.forEach((choice, index) => {
					const isSelected = index === selectedIndex;
					const symbol = isSelected ? symbols.radioActive : symbols.radioInactive;
					const colorFn = isSelected ? colors.active : colors.secondary;
					const label = choice.hint
						? `${choice.label} ${colors.muted(choice.hint)}`
						: choice.label;
					process.stdout.write(
						`${colors.secondary(symbols.bar)}  ${colorFn(symbol)}  ${label}\n`
					);
				});

				hasRendered = true;
			};

			// Resume stdin if it was paused
			if (process.stdin.isTTY && process.stdin.isPaused()) {
				process.stdin.resume();
			}

			render();

			readline.emitKeypressEvents(process.stdin);
			if (process.stdin.isTTY) {
				process.stdin.setRawMode(true);
			}

			const onKeypress = (_str: string, key: KeypressEvent) => {
				if (key.name === 'up' || key.name === 'k') {
					selectedIndex = Math.max(0, selectedIndex - 1);
					render();
				} else if (key.name === 'down' || key.name === 'j') {
					selectedIndex = Math.min(choices.length - 1, selectedIndex + 1);
					render();
				} else if (key.name === 'return') {
					cleanup();
					const selected = choices[selectedIndex];

					// Clear all lines (message + all choices)
					const totalLines = choices.length + 1;
					for (let i = 0; i < totalLines; i++) {
						readline.moveCursor(process.stdout, 0, -1);
						readline.clearLine(process.stdout, 0);
					}
					readline.cursorTo(process.stdout, 0);

					// Show completed state
					process.stdout.write(
						`${colors.completed(symbols.completed)}  ${message}\n${colors.secondary(symbols.bar)}  ${colors.muted(selected.label)}\n${colors.secondary(symbols.bar)}\n`
					);

					this.states.push({
						type: 'completed',
						message,
						value: selected.value,
					});

					resolve(selected.value);
				} else if (key.ctrl && key.name === 'c') {
					cleanup();
					console.log('\n');
					this.cancel('Operation cancelled');
					reject(new Error('User cancelled'));
				}
			};

			const cleanup = () => {
				process.stdin.removeListener('keypress', onKeypress);
				if (process.stdin.isTTY) {
					process.stdin.setRawMode(false);
				}
			};

			process.stdin.on('keypress', onKeypress);
		});
	}

	/**
	 * Multi-select (multiple choices) prompt
	 */
	async multiselect<T = string>(options: MultiSelectOptions<T>): Promise<T[]> {
		const { message, options: choices, initial = [] } = options;

		return new Promise((resolve, reject) => {
			let cursorIndex = 0;
			const selected = new Set<number>(
				choices.map((c, i) => (initial.includes(c.value) ? i : -1)).filter((i) => i >= 0)
			);

			let hasRendered = false;

			const render = () => {
				// Clear previous render
				if (hasRendered && process.stdout.isTTY) {
					// Move cursor up to the start of the prompt (message + all choices)
					const totalLines = choices.length + 1;
					readline.moveCursor(process.stdout, 0, -totalLines);
					readline.cursorTo(process.stdout, 0);
					readline.clearScreenDown(process.stdout);
				}

				process.stdout.write(
					`${colors.active(symbols.active)}  ${message} ${colors.muted('(space to select, enter to confirm)')}\n`
				);

				choices.forEach((choice, index) => {
					const isCursor = index === cursorIndex;
					const isSelected = selected.has(index);
					const symbol = isSelected ? symbols.checkboxSelected : symbols.checkboxActive;
					const colorFn = isCursor ? colors.active : colors.secondary;
					const label = choice.hint
						? `${choice.label} ${colors.muted(choice.hint)}`
						: choice.label;
					process.stdout.write(
						`${colors.secondary(symbols.bar)}  ${colorFn(symbol)}  ${label}\n`
					);
				});

				hasRendered = true;
			};

			// Resume stdin if it was paused
			if (process.stdin.isTTY && process.stdin.isPaused()) {
				process.stdin.resume();
			}

			render();

			readline.emitKeypressEvents(process.stdin);
			if (process.stdin.isTTY) {
				process.stdin.setRawMode(true);
			}

			const onKeypress = (_str: string, key: KeypressEvent) => {
				if (key.name === 'up' || key.name === 'k') {
					cursorIndex = Math.max(0, cursorIndex - 1);
					render();
				} else if (key.name === 'down' || key.name === 'j') {
					cursorIndex = Math.min(choices.length - 1, cursorIndex + 1);
					render();
				} else if (key.name === 'space') {
					if (selected.has(cursorIndex)) {
						selected.delete(cursorIndex);
					} else {
						selected.add(cursorIndex);
					}
					render();
				} else if (key.name === 'return') {
					cleanup();
					
					// Sort indices to get consistent order for both values and labels
					const sortedIndices = Array.from(selected).sort((a, b) => a - b);
					const values = sortedIndices.map((i) => choices[i].value);
					const labels = sortedIndices.map((i) => choices[i].label);

					// Clear all lines (message + all choices)
					const totalLines = choices.length + 1;
					for (let i = 0; i < totalLines; i++) {
						readline.moveCursor(process.stdout, 0, -1);
						readline.clearLine(process.stdout, 0);
					}
					readline.cursorTo(process.stdout, 0);

					// Show completed state
					const displayValue = labels.length > 0 ? labels.join(', ') : 'None';
					process.stdout.write(
						`${colors.completed(symbols.completed)}  ${message}\n${colors.secondary(symbols.bar)}  ${colors.muted(displayValue)}\n${colors.secondary(symbols.bar)}\n`
					);

					this.states.push({
						type: 'completed',
						message,
						value: values,
					});

					resolve(values);
				} else if (key.ctrl && key.name === 'c') {
					cleanup();
					console.log('\n');
					this.cancel('Operation cancelled');
					reject(new Error('User cancelled'));
				}
			};

			const cleanup = () => {
				process.stdin.removeListener('keypress', onKeypress);
				if (process.stdin.isTTY) {
					process.stdin.setRawMode(false);
				}
			};

			process.stdin.on('keypress', onKeypress);
		});
	}

	/**
	 * Cancel the flow
	 */
	cancel(message: string): void {
		console.log(`${colors.error(symbols.cancel)}  ${message}\n`);
		process.exit(0);
	}
}

/**
 * Create a new prompt flow instance
 */
export function createPrompt(): PromptFlow {
	return new PromptFlow();
}
