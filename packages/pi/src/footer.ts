/**
 * Coder footer for the Pi TUI.
 *
 * Uses transparent backgrounds with foreground-only ANSI true-color text.
 * Includes a braille spinner animation when an agent is actively working.
 *
 * Layout:
 *   [brand] [branch] > [model/agent]                    [hub] token-stats
 */

import type {
	ExtensionContext,
	ReadonlyFooterDataProvider,
} from '@mariozechner/pi-coding-agent';

const RESET = '\x1b[0m';
const SEP = '>';

// ──────────────────────────────────────────────
// ANSI true-color helper (foreground only)
// ──────────────────────────────────────────────

type RGB = [number, number, number];

function fg(color: RGB, text: string): string {
	return `\x1b[38;2;${color[0]};${color[1]};${color[2]}m${text}`;
}

// ──────────────────────────────────────────────
// Color palette (foreground only, no backgrounds)
// ──────────────────────────────────────────────

const FG_BRAND: RGB = [100, 200, 255];
const FG_MODEL: RGB = [215, 135, 175];
const FG_AGENT: RGB = [130, 200, 130];
const FG_BRANCH: RGB = [150, 180, 150];
const FG_HUB_OK: RGB = [80, 200, 120];
const FG_HUB_ERR: RGB = [220, 80, 80];
const FG_DIM: RGB = [100, 110, 120];

// ──────────────────────────────────────────────
// Braille spinner
// ──────────────────────────────────────────────

const SPINNER_FRAMES = [
	'\u280B', '\u2819', '\u2839', '\u2838', '\u283C',
	'\u2834', '\u2826', '\u2827', '\u2807', '\u280F',
];

// ──────────────────────────────────────────────
// Footer builder (transparent bg, foreground only)
// ──────────────────────────────────────────────

/** Strip ANSI escape sequences to get visible character count. */
function visibleLength(str: string): number {
	// eslint-disable-next-line no-control-regex
	return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}

/** Truncate an ANSI-colored string to a maximum visible width. */
function truncateAnsi(str: string, maxWidth: number): string {
	let visible = 0;
	let i = 0;
	while (i < str.length && visible < maxWidth) {
		if (str[i] === '\x1b') {
			// Skip entire ANSI escape sequence
			const end = str.indexOf('m', i);
			if (end !== -1) {
				i = end + 1;
			} else {
				i++;
			}
		} else {
			visible++;
			i++;
		}
	}
	return str.slice(0, i) + RESET;
}

function buildFooter(left: string, rightText: string, width: number): string {
	const leftLen = visibleLength(left);
	const rightLen = visibleLength(rightText);
	const total = leftLen + 1 + rightLen;

	if (total > width) {
		// Content too wide — truncate left side to fit
		const maxLeft = width - rightLen - 1;
		if (maxLeft > 0) {
			return truncateAnsi(left, maxLeft) + ' ' + rightText;
		}
		// Even right alone too wide — hard truncate everything
		return truncateAnsi(left + ' ' + rightText, width);
	}

	const gap = width - leftLen - rightLen;
	return left + ' '.repeat(gap) + rightText;
}

// ──────────────────────────────────────────────
// Minimal component
// ──────────────────────────────────────────────

class FooterComponent {
	private getText: (width: number) => string;
	private _unsubscribeBranch?: () => void;
	private _spinnerTimer: ReturnType<typeof setInterval> | null = null;

	constructor(
		getText: (width: number) => string,
		footerData: ReadonlyFooterDataProvider,
		cleanupSpinner: () => void,
	) {
		this.getText = getText;
		this._cleanupSpinner = cleanupSpinner;
		this._unsubscribeBranch = footerData.onBranchChange(() => {
			// Triggers TUI refresh
		});
	}

	private _cleanupSpinner: () => void;

	render(width: number): string[] {
		return [this.getText(width)];
	}

	invalidate(): void {
		// no-op
	}

	dispose(): void {
		this._unsubscribeBranch?.();
		this._cleanupSpinner();
	}
}

// ──────────────────────────────────────────────
// Token stat formatters
// ──────────────────────────────────────────────

function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return String(n);
}

function formatCost(n: number): string {
	if (n === 0) return '$0.00';
	if (n < 0.01) return `$${n.toFixed(4)}`;
	return `$${n.toFixed(2)}`;
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Set up the Coder footer (transparent bg, foreground-colored text).
 * Call this once with the extension context to replace Pi's default footer.
 *
 * Includes a braille spinner animation when an agent is actively working.
 *
 * @param ctx  Extension context with UI access
 * @param isHubConnected  Callback that returns current Hub connection state
 */
export function setupCoderFooter(
	ctx: ExtensionContext,
	isHubConnected: () => boolean,
): void {
	if (!ctx.hasUI) return;

	ctx.ui.setFooter((tui, _theme, footerData) => {
		// Spinner state
		let spinnerTimer: ReturnType<typeof setInterval> | null = null;
		let spinnerFrame = 0;

		const getText = (width: number): string => {
			// Detect active agent
			const activeAgent = footerData.getExtensionStatuses().get('active_agent');

			// Start/stop spinner based on agent activity
			if (activeAgent && !spinnerTimer) {
				spinnerTimer = setInterval(() => {
					spinnerFrame = (spinnerFrame + 1) % SPINNER_FRAMES.length;
					tui.requestRender();
				}, 80);
			} else if (!activeAgent && spinnerTimer) {
				clearInterval(spinnerTimer);
				spinnerTimer = null;
				spinnerFrame = 0;
			}

			// Token stats from session messages
			let inputTokens = 0;
			let outputTokens = 0;
			let totalCost = 0;
			for (const entry of ctx.sessionManager.getBranch()) {
				if (entry.type === 'message') {
					const msg = entry.message as {
						role?: string;
						usage?: { input: number; output: number; cost: { total: number } };
					};
					if (msg.role === 'assistant' && msg.usage) {
						inputTokens += msg.usage.input;
						outputTokens += msg.usage.output;
						totalCost += msg.usage.cost.total;
					}
				}
			}
			const tokenStr = `\u2191${formatTokens(inputTokens)} \u2193${formatTokens(outputTokens)} ${formatCost(totalCost)}`;

			// LEFT side: brand > branch > model/agent
			const leftParts: string[] = [];

			// Brand (with spinner)
			const brandChar = spinnerTimer
				? SPINNER_FRAMES[spinnerFrame]!
				: '\u2A3A';
			leftParts.push(fg(FG_BRAND, ` ${brandChar}`));

			// Branch
			const branch = footerData.getGitBranch();
			if (branch) {
				leftParts.push(' ');
				leftParts.push(fg(FG_BRANCH, branch));
			}

			// Model or active agent
			leftParts.push(fg(FG_DIM, ` ${SEP} `));
			if (activeAgent) {
				leftParts.push(fg(FG_AGENT, activeAgent));
			} else {
				const modelId = ctx.model
					? String((ctx.model as { id?: string }).id ?? '?')
					: '?';
				leftParts.push(fg(FG_MODEL, modelId));
			}

			const left = leftParts.join('');

			// RIGHT side: hub status + token stats
			const rightParts: string[] = [];
			rightParts.push(isHubConnected() ? fg(FG_HUB_OK, '\u25A0') : fg(FG_HUB_ERR, '\u25A0'));
			rightParts.push(fg(FG_DIM, `  ${tokenStr}`) + RESET);
			const rightText = rightParts.join('');

			return buildFooter(left, rightText, width);
		};

		const cleanupSpinner = (): void => {
			if (spinnerTimer) {
				clearInterval(spinnerTimer);
				spinnerTimer = null;
			}
		};

		return new FooterComponent(getText, footerData, cleanupSpinner);
	});
}
