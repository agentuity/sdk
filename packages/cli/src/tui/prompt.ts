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
	hint?: string;
	/**
	 * Pre-generated suggestion shown dim in the hint line.
	 * Submitting empty input accepts the placeholder.
	 * Unlike `initial`, this is rendered visibly so the user knows what they'll get.
	 */
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

	private isInteractive(): boolean {
		return Boolean(process.stdin.isTTY && process.stdout.isTTY);
	}

	private nonInteractiveError(message: string): Error {
		return new Error(
			`${message} Use the appropriate --flag or environment variable to provide input.`
		);
	}

	/**
	 * Display intro banner
	 */
	intro(title: string): void {
		console.log(`${colors.secondary(symbols.squareTL)}   ${colors.inverseCyan(` ⨺ ${title} `)}`);
		console.log(colors.secondary(symbols.bar));
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
	 *
	 * Two render paths:
	 *  - With `placeholder`: custom raw-keypress renderer that paints the placeholder
	 *    inline as dim ghost text at the cursor (autofill style). Vanishes on the first
	 *    keystroke; Enter on an empty buffer accepts the placeholder.
	 *  - Without `placeholder`: original readline-based renderer (untouched).
	 */
	async text(options: TextOptions): Promise<string> {
		const { message, validate, placeholder } = options;
		// `placeholder` acts as a visible default: empty submit resolves to it.
		// `initial` (legacy, invisible) still works but `placeholder` takes precedence.
		const fallback = placeholder ?? options.initial ?? '';
		const hasDefault = placeholder !== undefined || options.initial !== undefined;

		if (!this.isInteractive()) {
			if (hasDefault) {
				const validationResult = validate ? await validate(fallback) : true;
				if (validationResult === true) {
					return fallback;
				}
				// Validation failed - include the error message if it's a string
				const errorDetail = typeof validationResult === 'string' ? `: ${validationResult}` : '';
				throw this.nonInteractiveError(
					`Cannot prompt for "${message}" in non-interactive mode. Validation failed for default value "${fallback}"${errorDetail}.`
				);
			}
			throw this.nonInteractiveError(`Cannot prompt for "${message}" in non-interactive mode.`);
		}

		if (placeholder) {
			return this.textWithGhost(options, placeholder);
		}

		return new Promise((resolve, reject) => {
			const rl = readline.createInterface({
				input: process.stdin,
				output: process.stdout,
				prompt: `${colors.secondary(symbols.bar)}  `, // custom prompt instead of default ">"
			});

			let hasError = false;
			let hadValidationError = false;

			const showPrompt = () => {
				// Show prompt with active symbol
				process.stdout.write(`${colors.active(symbols.active)}  ${message}\n`);
				if (options.hint) {
					process.stdout.write(
						`${colors.secondary(symbols.bar)}  ${colors.muted(options.hint)}\n`
					);
				}
				// Use readline's prompt for the input line
				rl.prompt();
			};

			showPrompt();

			rl.on('line', async (input) => {
				const trimmed = input.trim();
				// After a validation error, require explicit input - don't fall back to default.
				const value = trimmed.length > 0 ? trimmed : hadValidationError ? '' : fallback;

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
								`${colors.error(symbols.error)}  ${message}\n${colors.secondary(symbols.bar)}  ${colors.error(errorMsg)}\n`
							);
							// Use readline's prompt for the input line
							rl.prompt();
							hasError = true;
							hadValidationError = true;
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
				const linesToClear = hasError ? 4 : 3;
				readline.moveCursor(process.stdout, 0, -linesToClear);
				readline.clearScreenDown(process.stdout);

				// If value is empty, only show message and separator (no value line)
				if (value === '') {
					process.stdout.write(
						`${colors.completed(symbols.completed)}  ${message}\n${colors.secondary(symbols.bar)}\n`
					);
				} else {
					process.stdout.write(
						`${colors.completed(symbols.completed)}  ${message}\n${colors.secondary(symbols.bar)}  ${colors.muted(value)}\n${colors.secondary(symbols.bar)}\n`
					);
				}

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
	 * Text input with inline ghost-text placeholder (autofill style).
	 *
	 * Layout:
	 *   ◆  <message>
	 *   │  <hint>           (optional)
	 *   │  <typed>│<ghost>   ghost is dim, vanishes on first keystroke
	 *
	 * Behavior:
	 *   - Typing any char hides the ghost permanently for this prompt instance.
	 *   - Backspacing back to empty does NOT bring the ghost back.
	 *   - Enter on empty buffer → resolves to placeholder.
	 *   - Enter with typed text → resolves to typed text.
	 *   - Validation error: shows inline error, ghost stays gone, user must type.
	 *   - Ctrl+C: cancels.
	 */
	private async textWithGhost(options: TextOptions, placeholder: string): Promise<string> {
		const { message, validate, hint } = options;

		return new Promise((resolve, reject) => {
			let buffer = '';
			// Tracks whether the ghost should still be visible. Once any printable key is
			// pressed it goes false and stays false for the rest of this prompt.
			let ghostVisible = true;
			let hasError = false;
			let errorMsg = '';

			const inputPrefix = `${colors.secondary(symbols.bar)}  `;
			// Visible-character length of the input-line prefix ("│  " = 3 cells).
			const PREFIX_VISIBLE = 3;

			/**
			 * Repaint everything from the message line down. Cursor must be on the
			 * message line (column 0) when this is called for the first time, or we
			 * just moved up to it after a clear.
			 */
			const paint = () => {
				const symbol = hasError ? colors.error(symbols.error) : colors.active(symbols.active);
				process.stdout.write(`${symbol}  ${message}\n`);

				if (hasError) {
					process.stdout.write(
						`${colors.secondary(symbols.bar)}  ${colors.error(errorMsg)}\n`
					);
				} else if (hint) {
					process.stdout.write(`${colors.secondary(symbols.bar)}  ${colors.muted(hint)}\n`);
				}

				// Input line.
				process.stdout.write(inputPrefix);
				process.stdout.write(buffer);

				if (ghostVisible && buffer.length === 0) {
					// Paint the ghost, then move the cursor back to the start of it so the
					// caret sits where the user would start typing.
					process.stdout.write(colors.muted(placeholder));
					readline.moveCursor(process.stdout, -placeholder.length, 0);
				}
			};

			/**
			 * Number of terminal lines currently occupied by our render, so we know
			 * how many to clear on the next repaint.
			 * Always: message (1) + hint-or-error (0/1) + input (1).
			 */
			const renderedLines = (): number => {
				let n = 1; // message
				if (hasError || hint) n += 1;
				n += 1; // input
				return n;
			};

			const repaint = () => {
				// Move cursor to column 0, then up to the start of our render block, then clear.
				readline.cursorTo(process.stdout, 0);
				readline.moveCursor(process.stdout, 0, -(renderedLines() - 1));
				readline.clearScreenDown(process.stdout);
				paint();
			};

			// Resume stdin if it was paused by a prior prompt.
			if (process.stdin.isTTY && process.stdin.isPaused()) {
				process.stdin.resume();
			}

			readline.emitKeypressEvents(process.stdin);
			if (process.stdin.isTTY) {
				process.stdin.setRawMode(true);
			}

			// Initial paint.
			paint();

			const cleanup = () => {
				process.stdin.removeListener('keypress', onKeypress);
				if (process.stdin.isTTY) {
					process.stdin.setRawMode(false);
					process.stdin.pause();
				}
			};

			const finalize = (value: string) => {
				// Repaint as completed: replace whole render block with the completed lines.
				readline.cursorTo(process.stdout, 0);
				readline.moveCursor(process.stdout, 0, -(renderedLines() - 1));
				readline.clearScreenDown(process.stdout);

				if (value === '') {
					process.stdout.write(
						`${colors.completed(symbols.completed)}  ${message}\n${colors.secondary(symbols.bar)}\n`
					);
				} else {
					process.stdout.write(
						`${colors.completed(symbols.completed)}  ${message}\n${colors.secondary(symbols.bar)}  ${colors.muted(value)}\n${colors.secondary(symbols.bar)}\n`
					);
				}

				this.states.push({ type: 'completed', message, value });
				cleanup();
				resolve(value);
			};

			const onKeypress = async (str: string, key: KeypressEvent) => {
				if (key.ctrl && key.name === 'c') {
					cleanup();
					console.log('\n');
					this.cancel('Operation cancelled');
					reject(new Error('User cancelled'));
					return;
				}

				if (key.name === 'return') {
					const trimmed = buffer.trim();
					// Empty submit accepts the placeholder, but only if no error has occurred
					// (after an error the user must type explicitly — same rule the readline
					// path uses).
					const value = trimmed.length > 0 ? trimmed : hasError ? '' : placeholder;

					if (validate) {
						try {
							const result = await validate(value);
							if (result !== true) {
								errorMsg = typeof result === 'string' ? result : 'Invalid input';
								hasError = true;
								ghostVisible = false;
								repaint();
								return;
							}
						} catch (err) {
							errorMsg = err instanceof Error ? err.message : 'Validation failed';
							hasError = true;
							ghostVisible = false;
							repaint();
							return;
						}
					}

					finalize(value);
					return;
				}

				if (key.name === 'backspace') {
					if (buffer.length > 0) {
						buffer = buffer.slice(0, -1);
						repaint();
					}
					return;
				}

				// Printable single character (ignore arrow keys, function keys, etc.).
				if (str && str.length === 1 && !key.ctrl && str >= ' ' && str !== '\x7f') {
					buffer += str;
					ghostVisible = false;
					repaint();
					return;
				}

				// Everything else (arrows, tab, etc.) is ignored.
			};

			// Mark the prefix length as used so the unused-var rule doesn't trip when we
			// extend this in future. (Keeping it documented for cursor-math sanity.)
			void PREFIX_VISIBLE;

			process.stdin.on('keypress', onKeypress);
		});
	}

	/**
	 * Confirm (yes/no) prompt
	 */
	async confirm(options: ConfirmOptions): Promise<boolean> {
		const { message, initial = false } = options;

		if (!this.isInteractive()) {
			return initial;
		}

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

		if (!this.isInteractive()) {
			let selectedIndex = choices.findIndex((c) => c.value === initial);
			if (selectedIndex === -1) selectedIndex = 0;
			const selected = choices[selectedIndex];
			if (!selected) {
				throw this.nonInteractiveError(
					`Cannot prompt for "${message}" in non-interactive mode.`
				);
			}
			return selected.value;
		}

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
					if (!selected) {
						reject(new Error('No selection available'));
						return;
					}

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

		if (!this.isInteractive()) {
			const choiceValues = new Set(choices.map((choice) => choice.value));
			return initial.filter((value) => choiceValues.has(value));
		}

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
					const values = sortedIndices
						.map((i) => choices[i]?.value)
						.filter((v) => v !== undefined);
					const labels = sortedIndices
						.map((i) => choices[i]?.label)
						.filter((l) => l !== undefined);

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
