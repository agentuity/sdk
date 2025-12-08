/**
 * Steps UI Component v2 - Clean state-driven implementation
 *
 * Key principle: Render entire step list from state on every update cycle.
 * Track total lines rendered to calculate cursor movement.
 */

import type { ColorScheme } from './terminal';
import type { LogLevel } from './types';
import { ValidationInputError, ValidationOutputError, type IssuesType } from '@agentuity/server';

// Spinner frames
const FRAMES = ['◐', '◓', '◑', '◒'];

// Icons
const ICONS = {
	success: '✓',
	skipped: '○',
	error: '✗',
	pending: '☐',
} as const;

// Color definitions
const COLORS = {
	cyan: { light: '\x1b[36m', dark: '\x1b[96m' },
	blue: { light: '\x1b[34m', dark: '\x1b[94m' },
	magenta: { light: '\x1b[35m', dark: '\x1b[95m' },
	green: { light: '\x1b[32m', dark: '\x1b[92m' },
	yellow: { light: '\x1b[33m', dark: '\x1b[93m' },
	red: { light: '\x1b[31m', dark: '\x1b[91m' },
	gray: { light: '\x1b[90m', dark: '\x1b[37m' },
	bold: '\x1b[1m',
	strikethrough: '\x1b[9m',
	reset: '\x1b[0m',
} as const;

const SPINNER_COLORS = ['cyan', 'blue', 'magenta', 'cyan'] as const;

const currentColorScheme: ColorScheme = process.env.CI ? 'light' : 'dark';

function getColor(colorKey: keyof typeof COLORS): string {
	const color = COLORS[colorKey];
	if (typeof color === 'string') {
		return color;
	}
	return color[currentColorScheme];
}

/**
 * Step outcome returned by step.run()
 */
export type StepOutcome =
	| { status: 'success'; output?: string[] }
	| { status: 'skipped'; reason?: string; output?: string[] }
	| { status: 'error'; message: string; cause?: Error; output?: string[] };

/**
 * Helper functions for creating step outcomes
 */
export const stepSuccess = (output?: string[]): StepOutcome => ({ status: 'success', output });
export const stepSkipped = (reason?: string, output?: string[]): StepOutcome => ({
	status: 'skipped',
	reason,
	output,
});
export const stepError = (message: string, cause?: Error, output?: string[]): StepOutcome => ({
	status: 'error',
	message,
	cause,
	output,
});

/**
 * Context passed to step run function
 */
export interface StepContext {
	progress: (n: number) => void;
}

/**
 * Step definition
 */
export interface Step {
	label: string;
	run: (ctx: StepContext) => Promise<StepOutcome>;
}

/**
 * Internal step state
 */
type StepStatus = 'pending' | 'running' | 'success' | 'skipped' | 'error';

interface StepState {
	label: string;
	status: StepStatus;
	progress?: number;
	output?: string[];
	skipReason?: string;
	errorMessage?: string;
	errorCause?: Error;
}

/**
 * Render a single step line (without output box)
 */
function renderStepLine(step: StepState, spinner?: string): string {
	const grayColor = getColor('gray');
	const greenColor = getColor('green');
	const yellowColor = getColor('yellow');
	const redColor = getColor('red');
	const cyanColor = getColor('cyan');

	if (step.status === 'success') {
		return `${greenColor}${ICONS.success}${COLORS.reset} ${grayColor}${COLORS.strikethrough}${step.label}${COLORS.reset}`;
	} else if (step.status === 'skipped') {
		const reason = step.skipReason ? ` ${grayColor}(${step.skipReason})${COLORS.reset}` : '';
		return `${yellowColor}${ICONS.skipped}${COLORS.reset} ${grayColor}${COLORS.strikethrough}${step.label}${COLORS.reset}${reason}`;
	} else if (step.status === 'error') {
		return `${redColor}${ICONS.error}${COLORS.reset} ${step.label}`;
	} else if (step.status === 'running' && spinner) {
		const progressIndicator =
			step.progress !== undefined
				? ` ${cyanColor}${Math.floor(step.progress)}%${COLORS.reset}`
				: '';
		return `${spinner} ${step.label}${progressIndicator}`;
	} else {
		return `${grayColor}${ICONS.pending}${COLORS.reset} ${step.label}`;
	}
}

/**
 * Render all steps from state, including output boxes
 * Returns the rendered output and total line count
 */
function renderAllSteps(
	state: StepState[],
	runningStepIndex: number,
	spinner?: string
): { output: string; totalLines: number } {
	const lines: string[] = [];
	let totalLines = 0;
	const grayColor = getColor('gray');

	for (let i = 0; i < state.length; i++) {
		const step = state[i];
		const isRunning = i === runningStepIndex;
		const stepSpinner = isRunning && spinner ? spinner : undefined;

		// Render step line
		lines.push(renderStepLine(step, stepSpinner));
		totalLines++;

		// Render output box if present
		if (step.output && step.output.length > 0) {
			lines.push(`${grayColor}╭─ Output${COLORS.reset}`);
			totalLines++;

			for (const line of step.output) {
				lines.push(`${grayColor}│${COLORS.reset} ${line}`);
				totalLines++;
			}

			lines.push(`${grayColor}╰─${COLORS.reset}`);
			totalLines++;

			// Don't add blank line here - the '\n' we append during write creates separation
		}
	}

	return { output: lines.join('\n'), totalLines };
}

/**
 * Print validation issues (for ValidationInputError/ValidationOutputError)
 */
function printValidationIssues(issues?: IssuesType) {
	const errorColor = getColor('red');
	console.error(`${errorColor}Validation details:${COLORS.reset}`);
	if (issues) {
		for (const issue of issues) {
			const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
			console.error(`  ${path}: ${issue.message}`);
		}
	}
}

/**
 * Global pause state and tracking
 */
let isPaused = false;
let getTotalLinesFn: (() => number) | null = null;
let forceRerenderFn: ((skipMove?: boolean) => void) | null = null;

export function isStepUIPaused(): boolean {
	return isPaused;
}

/**
 * Internal function to set pause capability
 */
function enablePauseResume(
	getTotalLines: () => number,
	forceRerender: (skipMove?: boolean) => void
): void {
	getTotalLinesFn = getTotalLines;
	forceRerenderFn = forceRerender;
}

/**
 * Pause step rendering for interactive input
 * Returns resume function
 */
export function pauseStepUI(): () => void {
	if (!process.stdout.isTTY || !getTotalLinesFn) {
		return () => {}; // No-op if not TTY or not in step context
	}

	isPaused = true;

	const originalStdoutWrite = process.stdout.write.bind(process.stdout);
	const originalStderrWrite = process.stderr.write.bind(process.stderr);

	// Intercept writes during pause (unused but prevents issues with interactive prompts)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	process.stdout.write = ((chunk: any, ..._args: any[]) => {
		return originalStdoutWrite(chunk);
	}) as typeof process.stdout.write;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	process.stderr.write = ((chunk: any, ..._args: any[]) => {
		return originalStderrWrite(chunk);
	}) as typeof process.stderr.write;

	// Show cursor and add newline for separation
	process.stdout.write('\x1B[?25h');
	process.stdout.write('\n');

	// Return resume function
	return () => {
		isPaused = false;

		// Restore original write functions
		process.stdout.write = originalStdoutWrite;
		process.stderr.write = originalStderrWrite;

		// Restore cursor to saved position (where steps began)
		process.stdout.write('\x1B[u'); // Restore cursor position
		process.stdout.write('\x1B[0J'); // Clear from saved position to end of screen
		process.stdout.write('\x1B[?25l'); // Hide cursor

		// Force immediate re-render (cursor already at step start)
		if (forceRerenderFn) {
			forceRerenderFn(true);
		}
	};
}

/**
 * Get exit function (Bun.exit or process.exit)
 */
function getExitFn(): (code: number) => never {
	const bunExit = (globalThis as { Bun?: { exit?: (code: number) => never } }).Bun?.exit;
	return typeof bunExit === 'function' ? bunExit : process.exit.bind(process);
}

/**
 * Install interrupt handlers (SIGINT/SIGTERM + raw mode)
 */
function installInterruptHandlers(onInterrupt: () => void): () => void {
	const cleanupFns: Array<() => void> = [];

	const sigHandler = () => onInterrupt();
	process.on('SIGINT', sigHandler);
	process.on('SIGTERM', sigHandler);
	cleanupFns.push(() => {
		process.off('SIGINT', sigHandler);
		process.off('SIGTERM', sigHandler);
	});

	// TTY raw mode fallback
	const stdin = process.stdin as unknown as NodeJS.ReadStream;
	if (stdin && stdin.isTTY) {
		const onData = (buf: Buffer) => {
			if (buf.length === 1 && buf[0] === 0x03) onInterrupt();
		};
		try {
			stdin.setRawMode?.(true);
		} catch {
			// Ignore errors
		}
		stdin.resume?.();
		stdin.on('data', onData);
		cleanupFns.push(() => {
			stdin.off?.('data', onData);
			stdin.pause?.();
			try {
				stdin.setRawMode?.(false);
			} catch {
				// Ignore errors
			}
		});
	}

	return () => {
		for (const fn of cleanupFns.splice(0)) fn();
	};
}

/**
 * Run steps with TUI (animated mode)
 */
async function runStepsTUI(steps: Step[]): Promise<void> {
	// Initialize state
	const state: StepState[] = steps.map((s) => ({
		label: s.label,
		status: 'pending' as const,
	}));

	let totalLinesFromLastRender = 0;
	let interrupted = false;
	let activeInterval: ReturnType<typeof setInterval> | null = null;
	let currentStepIndex = -1;
	let currentFrameIndex = 0;

	// Hide cursor
	process.stdout.write('\x1B[?25l');

	// Set up interrupt handler
	const exit = getExitFn();
	const onInterrupt = () => {
		if (interrupted) return;
		interrupted = true;
		if (activeInterval) clearInterval(activeInterval);
		process.stdout.write('\x1B[?25h\n'); // Show cursor
		exit(130);
	};
	const restoreInterrupts = installInterruptHandlers(onInterrupt);

	// Force re-render function
	const forceRerender = (skipMove = false) => {
		if (currentStepIndex < 0 || currentStepIndex >= state.length) return;

		const colorKey = SPINNER_COLORS[currentFrameIndex % SPINNER_COLORS.length];
		const color = getColor(colorKey);
		const spinner = `${color}${COLORS.bold}${FRAMES[currentFrameIndex % FRAMES.length]}${COLORS.reset}`;
		const rendered = renderAllSteps(state, currentStepIndex, spinner);

		// Optionally move up, then to column 0
		if (!skipMove && totalLinesFromLastRender > 0) {
			process.stdout.write(`\x1B[${totalLinesFromLastRender}A`);
			process.stdout.write('\x1B[0G');
		}
		process.stdout.write('\x1B[0J');
		process.stdout.write(rendered.output + '\n');

		totalLinesFromLastRender = rendered.totalLines;
	};

	try {
		// Enable pause/resume capability
		enablePauseResume(() => totalLinesFromLastRender, forceRerender);

		// Save cursor position BEFORE rendering steps
		process.stdout.write('\x1B[s');

		// Initial render
		const initialRender = renderAllSteps(state, -1);
		process.stdout.write(initialRender.output + '\n');
		totalLinesFromLastRender = initialRender.totalLines;

		// Execute steps
		for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
			if (interrupted) break;

			currentStepIndex = stepIndex;
			currentFrameIndex = 0;

			const step = steps[stepIndex];
			const stepState = state[stepIndex];
			stepState.status = 'running';

			// Start spinner animation
			activeInterval = setInterval(() => {
				if (isPaused) return;

				const colorKey = SPINNER_COLORS[currentFrameIndex % SPINNER_COLORS.length];
				const color = getColor(colorKey);
				const spinner = `${color}${COLORS.bold}${FRAMES[currentFrameIndex % FRAMES.length]}${COLORS.reset}`;

				// Render all steps from state
				const rendered = renderAllSteps(state, currentStepIndex, spinner);

				// Move to start, clear, render
				if (totalLinesFromLastRender > 0) {
					process.stdout.write(`\x1B[${totalLinesFromLastRender}A`); // Move up
					process.stdout.write('\x1B[0G'); // Move to column 0 (using absolute positioning)
				}
				process.stdout.write('\x1B[0J'); // Clear from cursor to end
				process.stdout.write(rendered.output + '\n');

				totalLinesFromLastRender = rendered.totalLines;
				currentFrameIndex++;
			}, 120);

			// Progress callback
			const progressCallback = (progress: number) => {
				if (isPaused) return;

				stepState.progress = Math.min(100, Math.max(0, progress));

				// Render all steps from state
				const colorKey = SPINNER_COLORS[currentFrameIndex % SPINNER_COLORS.length];
				const color = getColor(colorKey);
				const spinner = `${color}${COLORS.bold}${FRAMES[currentFrameIndex % FRAMES.length]}${COLORS.reset}`;
				const rendered = renderAllSteps(state, currentStepIndex, spinner);

				// Move to start, clear, render
				if (totalLinesFromLastRender > 0) {
					process.stdout.write(`\x1B[${totalLinesFromLastRender}A`);
					process.stdout.write('\x1B[0G');
				}
				process.stdout.write('\x1B[0J');
				process.stdout.write(rendered.output + '\n');

				totalLinesFromLastRender = rendered.totalLines;
			};

			// Run the step
			try {
				const outcome = await step.run({ progress: progressCallback });

				// Update state from outcome
				if (outcome.status === 'success') {
					stepState.status = 'success';
					stepState.output = outcome.output;
				} else if (outcome.status === 'skipped') {
					stepState.status = 'skipped';
					stepState.skipReason = outcome.reason;
					stepState.output = outcome.output;
				} else {
					stepState.status = 'error';
					stepState.errorMessage = outcome.message;
					stepState.errorCause = outcome.cause;
					stepState.output = outcome.output;
				}
			} catch (err) {
				stepState.status = 'error';
				stepState.errorMessage = err instanceof Error ? err.message : String(err);
				stepState.errorCause = err instanceof Error ? err : undefined;
			}

			// Stop spinner
			if (activeInterval) {
				clearInterval(activeInterval);
				activeInterval = null;
			}

			// Final render with outcome
			stepState.progress = undefined;
			const finalRender = renderAllSteps(state, -1);

			if (totalLinesFromLastRender > 0) {
				process.stdout.write(`\x1B[${totalLinesFromLastRender}A`);
				process.stdout.write('\x1B[0G');
			}
			process.stdout.write('\x1B[0J');
			process.stdout.write(finalRender.output + '\n');

			totalLinesFromLastRender = finalRender.totalLines;

			// Handle errors
			if (stepState.status === 'error') {
				const errorColor = getColor('red');
				console.error(`\n${errorColor}Error: ${stepState.errorMessage}${COLORS.reset}`);
				if (
					stepState.errorCause instanceof ValidationInputError ||
					stepState.errorCause instanceof ValidationOutputError
				) {
					printValidationIssues(stepState.errorCause.issues);
				}
				console.error('');
				process.stdout.write('\x1B[?25h'); // Show cursor
				process.exit(1);
			}
		}

		// Show cursor
		process.stdout.write('\x1B[?25h');
	} catch (err) {
		process.stdout.write('\x1B[?25h');
		throw err;
	} finally {
		restoreInterrupts();
		getTotalLinesFn = null; // Clear pause capability
		forceRerenderFn = null;
	}
}

/**
 * Run steps in plain mode (no animations)
 */
async function runStepsPlain(steps: Step[]): Promise<void> {
	const grayColor = getColor('gray');
	const greenColor = getColor('green');
	const yellowColor = getColor('yellow');
	const redColor = getColor('red');

	for (const step of steps) {
		let outcome: StepOutcome;

		try {
			outcome = await step.run({ progress: () => {} });
		} catch (err) {
			outcome = {
				status: 'error',
				message: err instanceof Error ? err.message : String(err),
				cause: err instanceof Error ? err : undefined,
			};
		}

		// Print final state
		if (outcome.status === 'success') {
			console.log(`${greenColor}${ICONS.success}${COLORS.reset} ${step.label}`);
			if (outcome.output && outcome.output.length > 0) {
				console.log(`${grayColor}╭─ Output${COLORS.reset}`);
				for (const line of outcome.output) {
					console.log(`${grayColor}│${COLORS.reset} ${line}`);
				}
				console.log(`${grayColor}╰─${COLORS.reset}`);
				console.log('');
			}
		} else if (outcome.status === 'skipped') {
			const reason = outcome.reason ? ` ${grayColor}(${outcome.reason})${COLORS.reset}` : '';
			console.log(`${yellowColor}${ICONS.skipped}${COLORS.reset} ${step.label}${reason}`);
			if (outcome.output && outcome.output.length > 0) {
				console.log(`${grayColor}╭─ Output${COLORS.reset}`);
				for (const line of outcome.output) {
					console.log(`${grayColor}│${COLORS.reset} ${line}`);
				}
				console.log(`${grayColor}╰─${COLORS.reset}`);
				console.log('');
			}
		} else {
			console.log(`${redColor}${ICONS.error}${COLORS.reset} ${step.label}`);
			if (outcome.output && outcome.output.length > 0) {
				console.log(`${grayColor}╭─ Output${COLORS.reset}`);
				for (const line of outcome.output) {
					console.log(`${grayColor}│${COLORS.reset} ${line}`);
				}
				console.log(`${grayColor}╰─${COLORS.reset}`);
				console.log('');
			}
			const errorColor = getColor('red');
			console.error(`\n${errorColor}Error: ${outcome.message}${COLORS.reset}`);
			if (
				outcome.cause instanceof ValidationInputError ||
				outcome.cause instanceof ValidationOutputError
			) {
				printValidationIssues(outcome.cause.issues);
			}
			console.error('');
			process.exit(1);
		}
	}
}

/**
 * Run a series of steps with animated progress
 */
export async function runSteps(steps: Step[], logLevel?: LogLevel): Promise<void> {
	const useTUI =
		process.stdout.isTTY && (!logLevel || ['info', 'warn', 'error'].includes(logLevel));

	if (useTUI) {
		await runStepsTUI(steps);
	} else {
		await runStepsPlain(steps);
	}
}
