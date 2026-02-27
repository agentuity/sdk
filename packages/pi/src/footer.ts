/**
 * Coder footer for the Pi TUI.
 *
 * Uses transparent backgrounds with foreground-only ANSI true-color text.
 * Includes a braille spinner animation when an agent is actively working.
 *
 * Layout:
 *   [brand] > [model/agent] > [branch] > [hub]     token-stats  shortcuts  version
 */

import type {
	ExtensionContext,
	ReadonlyFooterDataProvider,
} from '@mariozechner/pi-coding-agent';

const VERSION = '1.0.22';
const RESET = '\x1b[0m';
const SEP_CHAR = '\u276F'; // >

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

interface Segment {
	fg: RGB;
	text: string;
}

/** Strip ANSI escape sequences to get visible character count. */
function visibleLength(str: string): number {
	// eslint-disable-next-line no-control-regex
	return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}

function buildFooter(
	segments: Segment[],
	sep: string,
	width: number,
	rightText: string,
): string {
	let result = '';

	for (let i = 0; i < segments.length; i++) {
		result += fg(segments[i]!.fg, segments[i]!.text);
		result += RESET;
		if (i < segments.length - 1) {
			result += sep;
		}
	}

	// Right-align
	const leftLen = visibleLength(result);
	const rightLen = visibleLength(rightText);
	const gap = Math.max(1, width - leftLen - rightLen);

	return result + ' '.repeat(gap) + rightText;
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
		const sep = fg(FG_DIM, SEP_CHAR) + RESET;

		// Spinner state
		let spinnerTimer: ReturnType<typeof setInterval> | null = null;
		let spinnerFrame = 0;

		const getText = (width: number): string => {
			const segments: Segment[] = [];

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

			// 1. Brand mark (or spinner when agent active)
			const brandChar = spinnerTimer
				? SPINNER_FRAMES[spinnerFrame]!
				: '\u2A3A';
			segments.push({ fg: FG_BRAND, text: ` ${brandChar} ` });

			// 2. Model or active agent
			if (activeAgent) {
				segments.push({ fg: FG_AGENT, text: ` ${activeAgent} ` });
			} else {
				const modelId = ctx.model
					? String((ctx.model as { id?: string }).id ?? '?')
					: '?';
				segments.push({ fg: FG_MODEL, text: ` ${modelId} ` });
			}

			// 3. Git branch (if available)
			const branch = footerData.getGitBranch();
			if (branch) {
				segments.push({ fg: FG_BRANCH, text: ` ${branch} ` });
			}

			// 4. Hub status
			const hubFg = isHubConnected() ? FG_HUB_OK : FG_HUB_ERR;
			segments.push({ fg: hubFg, text: ' \u25A0 ' });

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

			// Right side: token stats + shortcuts + version (dim, no background)
			const tokenStr = `\u2191${formatTokens(inputTokens)} \u2193${formatTokens(outputTokens)} ${formatCost(totalCost)}`;
			const rightText = fg(FG_DIM, `${tokenStr}  ctrl+e  ctrl+c  v${VERSION}`) + RESET;

			return buildFooter(segments, sep, width, rightText);
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
