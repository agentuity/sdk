/**
 * Step progress UI component for showing animated steps with callbacks
 *
 * Displays a checklist where each step animates in place with a spinner,
 * then shows success, skipped, or error icon based on callback result.
 */

import type { ColorScheme } from './terminal';

/**
 * Get the appropriate exit function (Bun.exit or process.exit)
 */
function getExitFn(): (code: number) => never {
	const bunExit = (globalThis as { Bun?: { exit?: (code: number) => never } }).Bun?.exit;
	return typeof bunExit === 'function' ? bunExit : process.exit.bind(process);
}

/**
 * Install interrupt handlers (SIGINT/SIGTERM + TTY raw mode for Ctrl+C)
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

	// TTY raw mode fallback for Bun/Windows/inconsistent SIGINT delivery
	const stdin = process.stdin as unknown as NodeJS.ReadStream;
	if (stdin && stdin.isTTY) {
		const onData = (buf: Buffer) => {
			// Ctrl+C is ASCII ETX (0x03)
			if (buf.length === 1 && buf[0] === 0x03) onInterrupt();
		};
		try {
			stdin.setRawMode?.(true);
		} catch {
			// ignore if not supported
		}
		stdin.resume?.();
		stdin.on('data', onData);
		cleanupFns.push(() => {
			stdin.off?.('data', onData);
			stdin.pause?.();
			try {
				stdin.setRawMode?.(false);
			} catch {
				// ignore if setRawMode fails
			}
		});
	}

	return () => {
		for (const fn of cleanupFns.splice(0)) fn();
	};
}

// Spinner frames
const FRAMES = ['◐', '◓', '◑', '◒'];

// Icons
const ICONS = {
	success: '✓',
	skipped: '○',
	error: '✗',
	pending: '☐',
} as const;

// Color definitions (light/dark adaptive)
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

// Spinner color sequence
const SPINNER_COLORS = ['cyan', 'blue', 'magenta', 'cyan'] as const;

let currentColorScheme: ColorScheme = process.env.CI ? 'light' : 'dark';

export function setStepsColorScheme(scheme: ColorScheme): void {
	currentColorScheme = scheme;
}

function getColor(colorKey: keyof typeof COLORS): string {
	const color = COLORS[colorKey];
	if (typeof color === 'string') {
		return color;
	}
	return color[currentColorScheme];
}

/**
 * Step outcome
 */
export type StepOutcome =
	| { status: 'success' }
	| { status: 'skipped'; reason?: string }
	| { status: 'error'; message: string };

/**
 * Helper functions for creating step outcomes
 */
export const stepSuccess = (): StepOutcome => ({ status: 'success' });
export const stepSkipped = (reason?: string): StepOutcome => ({ status: 'skipped', reason });
export const stepError = (message: string): StepOutcome => ({ status: 'error', message });

/**
 * Progress callback function
 */
export type ProgressCallback = (progress: number) => void;

/**
 * Step definition (without progress tracking)
 */
export interface SimpleStep {
	type?: 'simple';
	label: string;
	run: () => Promise<StepOutcome>;
}

/**
 * Step definition (with progress tracking)
 */
export interface ProgressStep {
	type: 'progress';
	label: string;
	run: (progress: ProgressCallback) => Promise<StepOutcome>;
}

/**
 * Step definition (discriminated union)
 */
export type Step = SimpleStep | ProgressStep;

/**
 * Internal step state
 */
type StepState =
	| {
			type: 'simple';
			label: string;
			run: () => Promise<StepOutcome>;
			outcome?: StepOutcome;
			progress?: number;
	  }
	| {
			type: 'progress';
			label: string;
			run: (progress: ProgressCallback) => Promise<StepOutcome>;
			outcome?: StepOutcome;
			progress?: number;
	  };

/**
 * Run a series of steps with animated progress
 *
 * Each step runs its callback while showing a spinner animation.
 * Steps can complete with success, skipped, or error status.
 * Exits with code 1 if any step errors.
 */
export async function runSteps(steps: Step[]): Promise<void> {
	const state: StepState[] = steps.map((s) => {
		const stepType = s.type === 'progress' ? 'progress' : 'simple';
		return stepType === 'progress'
			? {
					type: 'progress' as const,
					label: s.label,
					run: s.run as (progress: ProgressCallback) => Promise<StepOutcome>,
				}
			: { type: 'simple' as const, label: s.label, run: s.run as () => Promise<StepOutcome> };
	});

	// Hide cursor
	process.stdout.write('\x1B[?25l');

	// Track active interval and interrupted state
	let activeInterval: ReturnType<typeof setInterval> | null = null;
	let interrupted = false;

	// Set up Ctrl+C handler for graceful exit
	const exit = getExitFn();
	const onInterrupt = () => {
		if (interrupted) return;
		interrupted = true;
		if (activeInterval) clearInterval(activeInterval);
		process.stdout.write('\x1B[?25h\n'); // Show cursor
		exit(130);
	};
	const restoreInterrupts = installInterruptHandlers(onInterrupt);

	try {
		// Initial render
		process.stdout.write(renderSteps(state, -1) + '\n');

		for (let stepIndex = 0; stepIndex < state.length; stepIndex++) {
			if (interrupted) break;

			const step = state[stepIndex];
			let frameIndex = 0;

			// Start spinner animation
			activeInterval = setInterval(() => {
				const colorKey = SPINNER_COLORS[frameIndex % SPINNER_COLORS.length];
				const color = getColor(colorKey);
				const frame = `${color}${COLORS.bold}${FRAMES[frameIndex % FRAMES.length]}${COLORS.reset}`;

				// Move cursor up to the top of checklist
				process.stdout.write(`\x1B[${state.length}A`);
				process.stdout.write(renderSteps(state, stepIndex, frame) + '\n');

				frameIndex++;
			}, 120);

			// Run the step with progress tracking
			const progressCallback: ProgressCallback = (progress: number) => {
				step.progress = Math.min(100, Math.max(0, progress));

				// Move cursor up
				process.stdout.write(`\x1B[${state.length}A`);
				process.stdout.write(renderSteps(state, stepIndex) + '\n');
			};

			try {
				// Use discriminant to determine if step has progress callback
				const outcome =
					step.type === 'progress' ? await step.run(progressCallback) : await step.run();
				step.outcome = outcome;
			} catch (err) {
				step.outcome = {
					status: 'error',
					message: err instanceof Error ? err.message : String(err),
				};
			}

			if (activeInterval) {
				clearInterval(activeInterval);
				activeInterval = null;
			}

			// Clear progress and final render with outcome
			step.progress = undefined;
			process.stdout.write(`\x1B[${state.length}A`);
			process.stdout.write(renderSteps(state, stepIndex) + '\n');

			// If error, show error message and exit
			if (step.outcome?.status === 'error') {
				const errorColor = getColor('red');
				console.error(`\n${errorColor}Error: ${step.outcome.message}${COLORS.reset}\n`);
				process.stdout.write('\x1B[?25h'); // Show cursor
				process.exit(1);
			}
		}

		// Show cursor again
		process.stdout.write('\x1B[?25h');
	} catch (err) {
		// Ensure cursor is shown even if something goes wrong
		process.stdout.write('\x1B[?25h');
		throw err;
	} finally {
		// Remove signal/TTY handlers
		restoreInterrupts();
	}
}

/**
 * Render a progress indicator
 */
function renderProgress(progress: number): string {
	const cyanColor = getColor('cyan');

	const percentage = `${Math.floor(progress)}%`;
	return ` ${cyanColor}${percentage}${COLORS.reset}`;
}

/**
 * Render all steps as a multiline string
 */
function renderSteps(steps: StepState[], activeIndex: number, spinner?: string): string {
	const grayColor = getColor('gray');
	const greenColor = getColor('green');
	const yellowColor = getColor('yellow');
	const redColor = getColor('red');

	const lines: string[] = [];

	steps.forEach((s, i) => {
		if (s.outcome?.status === 'success') {
			lines.push(
				`${greenColor}${ICONS.success}${COLORS.reset} ${grayColor}${COLORS.strikethrough}${s.label}${COLORS.reset}`
			);
		} else if (s.outcome?.status === 'skipped') {
			const reason = s.outcome.reason ? ` ${grayColor}(${s.outcome.reason})${COLORS.reset}` : '';
			lines.push(
				`${yellowColor}${ICONS.skipped}${COLORS.reset} ${grayColor}${COLORS.strikethrough}${s.label}${COLORS.reset}${reason}`
			);
		} else if (s.outcome?.status === 'error') {
			lines.push(`${redColor}${ICONS.error}${COLORS.reset} ${s.label}`);
		} else if (i === activeIndex && spinner) {
			const progressIndicator = s.progress !== undefined ? renderProgress(s.progress) : '';
			lines.push(`${spinner} ${s.label}${progressIndicator}`);
		} else {
			lines.push(`${grayColor}${ICONS.pending}${COLORS.reset} ${s.label}`);
		}
	});

	return lines.join('\n');
}
