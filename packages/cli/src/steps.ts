/**
 * Step progress UI component for showing animated steps with callbacks
 *
 * Displays a checklist where each step animates in place with a spinner,
 * then shows success, skipped, or error icon based on callback result.
 */

import type { ColorScheme } from './terminal';

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

let currentColorScheme: ColorScheme = 'dark';

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
 * Step callback function
 */
export type StepCallback = () => Promise<StepOutcome>;

/**
 * Step definition
 */
export interface Step {
	label: string;
	run: StepCallback;
}

/**
 * Internal step state
 */
interface StepState {
	label: string;
	run: StepCallback;
	outcome?: StepOutcome;
}

/**
 * Run a series of steps with animated progress
 *
 * Each step runs its callback while showing a spinner animation.
 * Steps can complete with success, skipped, or error status.
 * Exits with code 1 if any step errors.
 */
export async function runSteps(steps: Step[]): Promise<void> {
	const state: StepState[] = steps.map((s) => ({
		label: s.label,
		run: s.run,
	}));

	// Hide cursor
	process.stdout.write('\x1B[?25l');

	try {
		// Initial render
		process.stdout.write(renderSteps(state, -1) + '\n');

		for (let stepIndex = 0; stepIndex < state.length; stepIndex++) {
			const step = state[stepIndex];
			let frameIndex = 0;

			// Start spinner animation
			const interval = setInterval(() => {
				const colorKey = SPINNER_COLORS[frameIndex % SPINNER_COLORS.length];
				const color = getColor(colorKey);
				const frame = `${color}${COLORS.bold}${FRAMES[frameIndex % FRAMES.length]}${COLORS.reset}`;

				// Move cursor up to the top of checklist
				process.stdout.write(`\x1B[${state.length}A`);
				process.stdout.write(renderSteps(state, stepIndex, frame) + '\n');

				frameIndex++;
			}, 120);

			// Run the step
			try {
				const outcome = await step.run();
				step.outcome = outcome;
			} catch (err) {
				step.outcome = {
					status: 'error',
					message: err instanceof Error ? err.message : String(err),
				};
			}

			clearInterval(interval);

			// Final render with outcome
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
		process.stdout.write('\x1B[?25h\n');
	} catch (err) {
		// Ensure cursor is shown even if something goes wrong
		process.stdout.write('\x1B[?25h');
		throw err;
	}
}

/**
 * Render all steps as a multiline string
 */
function renderSteps(steps: StepState[], activeIndex: number, spinner?: string): string {
	const grayColor = getColor('gray');
	const greenColor = getColor('green');
	const yellowColor = getColor('yellow');
	const redColor = getColor('red');

	return steps
		.map((s, i) => {
			if (s.outcome?.status === 'success') {
				return `${greenColor}${ICONS.success}${COLORS.reset} ${grayColor}${COLORS.strikethrough}${s.label}${COLORS.reset}`;
			} else if (s.outcome?.status === 'skipped') {
				const reason = s.outcome.reason
					? ` ${grayColor}(${s.outcome.reason})${COLORS.reset}`
					: '';
				return `${yellowColor}${ICONS.skipped}${COLORS.reset} ${grayColor}${COLORS.strikethrough}${s.label}${COLORS.reset}${reason}`;
			} else if (s.outcome?.status === 'error') {
				return `${redColor}${ICONS.error}${COLORS.reset} ${s.label}`;
			} else if (i === activeIndex && spinner) {
				return `${spinner} ${s.label}`;
			} else {
				return `${grayColor}${ICONS.pending}${COLORS.reset} ${s.label}`;
			}
		})
		.join('\n');
}
