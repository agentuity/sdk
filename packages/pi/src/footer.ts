/**
 * Powerline-style Coder footer for the Pi TUI.
 *
 * Uses raw ANSI true-color escape sequences for colored background segments
 * with powerline-style separators (U+276F).
 *
 * Layout:
 *   [bg1: brand][sep][bg2: model/agent][sep][bg3: branch][sep][bg4: hub][sep]  ...shortcuts  v1.0.22
 */

import type {
	ExtensionContext,
	ReadonlyFooterDataProvider,
} from '@mariozechner/pi-coding-agent';

const VERSION = '1.0.22';
const RESET = '\x1b[0m';
const SEP = '\u276F'; // ❯

// ──────────────────────────────────────────────
// ANSI true-color helpers
// ──────────────────────────────────────────────

type RGB = [number, number, number];

function fgBg(fg: RGB, bg: RGB, text: string): string {
	return `\x1b[38;2;${fg[0]};${fg[1]};${fg[2]}m\x1b[48;2;${bg[0]};${bg[1]};${bg[2]}m${text}`;
}

function fg(color: RGB, text: string): string {
	return `\x1b[38;2;${color[0]};${color[1]};${color[2]}m${text}`;
}

// ──────────────────────────────────────────────
// Color palette (subtle dark backgrounds)
// ──────────────────────────────────────────────

// Segment backgrounds
const BG_BRAND: RGB = [40, 44, 52];
const BG_MODEL: RGB = [30, 34, 42];
const BG_BRANCH: RGB = [35, 40, 35];
const BG_STATUS: RGB = [25, 28, 35];

// Foreground colors
const FG_BRAND: RGB = [100, 200, 255];
const FG_MODEL: RGB = [215, 135, 175];
const FG_AGENT: RGB = [130, 200, 130];
const FG_BRANCH: RGB = [150, 180, 150];
const FG_HUB_OK: RGB = [80, 200, 120];
const FG_HUB_ERR: RGB = [220, 80, 80];
const FG_DIM: RGB = [100, 110, 120];

// ──────────────────────────────────────────────
// Powerline builder
// ──────────────────────────────────────────────

interface Segment {
	bg: RGB;
	fg: RGB;
	text: string;
}

/** Strip ANSI escape sequences to get visible character count. */
function visibleLength(str: string): number {
	// eslint-disable-next-line no-control-regex
	return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}

function buildPowerline(segments: Segment[], width: number, rightText: string): string {
	let result = '';

	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i]!;

		// Segment content: fg on bg
		result += fgBg(seg.fg, seg.bg, seg.text);

		if (i < segments.length - 1) {
			// Separator: previous bg as fg, next bg as bg
			const next = segments[i + 1]!;
			result += fgBg(seg.bg, next.bg, SEP);
		} else {
			// Last segment: separator transitions to no background
			result += RESET;
			result += fg(seg.bg, SEP);
			result += RESET;
		}
	}

	// Right-align shortcuts/version
	const leftLen = visibleLength(result);
	const rightLen = visibleLength(rightText);
	const gap = Math.max(1, width - leftLen - rightLen);
	const padding = ' '.repeat(gap);

	return result + padding + rightText;
}

// ──────────────────────────────────────────────
// Minimal component
// ──────────────────────────────────────────────

class FooterComponent {
	private getText: (width: number) => string;
	private _unsubscribeBranch?: () => void;

	constructor(
		getText: (width: number) => string,
		footerData: ReadonlyFooterDataProvider,
	) {
		this.getText = getText;
		this._unsubscribeBranch = footerData.onBranchChange(() => {
			// Triggers TUI refresh
		});
	}

	render(width: number): string[] {
		// Let buildPowerline handle width-aware padding; the TUI clips to terminal width.
		// Do NOT compare text.length to width — text.length includes invisible ANSI escapes.
		return [this.getText(width)];
	}

	invalidate(): void {
		// no-op
	}

	dispose(): void {
		this._unsubscribeBranch?.();
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
 * Set up the Coder footer (powerline-style). Call this once with the
 * extension context to replace Pi's default footer.
 *
 * @param ctx  Extension context with UI access
 * @param isHubConnected  Callback that returns current Hub connection state
 */
export function setupCoderFooter(
	ctx: ExtensionContext,
	isHubConnected: () => boolean,
): void {
	if (!ctx.hasUI) return;

	ctx.ui.setFooter((_tui, _theme, footerData) => {
		const getText = (width: number): string => {
			const segments: Segment[] = [];

			// 1. Brand mark
			segments.push({ bg: BG_BRAND, fg: FG_BRAND, text: ' \u2A3A  ' });

			// 2. Model or active agent
			const activeAgent = footerData.getExtensionStatuses().get('active_agent');
			if (activeAgent) {
				segments.push({ bg: BG_MODEL, fg: FG_AGENT, text: ` ${activeAgent} ` });
			} else {
				const modelId = ctx.model
					? String((ctx.model as { id?: string }).id ?? '?')
					: '?';
				segments.push({ bg: BG_MODEL, fg: FG_MODEL, text: ` ${modelId} ` });
			}

			// 3. Git branch (if available)
			const branch = footerData.getGitBranch();
			if (branch) {
				segments.push({ bg: BG_BRANCH, fg: FG_BRANCH, text: ` ${branch} ` });
			}

			// 4. Hub status
			const hubFg = isHubConnected() ? FG_HUB_OK : FG_HUB_ERR;
			segments.push({ bg: BG_STATUS, fg: hubFg, text: ' \u25A0 ' });

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

			return buildPowerline(segments, width, rightText);
		};

		return new FooterComponent(getText, footerData);
	});
}
