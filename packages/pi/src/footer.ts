/**
 * Coder Hub footer for the Pi TUI.
 *
 * Shows token stats (input/output/cost) on the left and
 * model + Hub connection status on the right.
 */

import type {
	ExtensionContext,
	ReadonlyFooterDataProvider,
	Theme,
} from '@mariozechner/pi-coding-agent';

// ──────────────────────────────────────────────
// Minimal component — avoids importing @mariozechner/pi-tui directly.
// ──────────────────────────────────────────────

class FooterText {
	private getText: () => string;
	private theme: Theme;
	private footerData: ReadonlyFooterDataProvider;
	private _unsubscribeBranch?: () => void;

	constructor(
		getText: () => string,
		theme: Theme,
		footerData: ReadonlyFooterDataProvider,
	) {
		this.getText = getText;
		this.theme = theme;
		this.footerData = footerData;
	}

	render(width: number): string[] {
		const text = this.getText();
		// Single-line footer, truncated to viewport
		return [text.length > width ? text.slice(0, width) : text];
	}

	invalidate(): void {
		// no-op
	}

	dispose(): void {
		this._unsubscribeBranch?.();
	}
}

// ──────────────────────────────────────────────
// Formatting helpers
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
 * Set up the Coder footer. Call this once with the extension context
 * (from a session_start handler or similar) to replace Pi's default footer.
 *
 * @param ctx  Extension context with UI access
 * @param isHubConnected  Callback that returns current Hub connection state
 */
export function setupCoderFooter(
	ctx: ExtensionContext,
	isHubConnected: () => boolean,
): void {
	if (!ctx.hasUI) return;

	ctx.ui.setFooter((_tui, theme, footerData) => {
		const getText = (): string => {
			// ── Left side: token stats ──
			let input = 0;
			let output = 0;
			let cost = 0;

			for (const e of ctx.sessionManager.getBranch()) {
				if (e.type === 'message' && e.message && 'role' in e.message) {
					const msg = e.message as {
						role: string;
						usage?: { input: number; output: number; cost: { total: number } };
					};
					if (msg.role === 'assistant' && msg.usage) {
						input += msg.usage.input;
						output += msg.usage.output;
						cost += msg.usage.cost.total;
					}
				}
			}

			const tokensStr = `\u{2191}${formatTokens(input)} \u{2193}${formatTokens(output)} ${formatCost(cost)}`;
			const left = theme.fg('muted', tokensStr);

			// ── Right side: model + Hub status ──
			const modelId = ctx.model
				? `${(ctx.model as { provider?: string }).provider ?? ''}/${(ctx.model as { id?: string }).id ?? ''}`
				: '?';

			const hubStatus = isHubConnected()
				? theme.fg('success', '\u{1F7E2} Hub')
				: theme.fg('error', '\u{1F534} Hub');

			// Extension statuses from other extensions
			const statuses = footerData.getExtensionStatuses();
			const statusParts: string[] = [];
			for (const [, text] of statuses) {
				if (text) statusParts.push(theme.fg('muted', text));
			}

			const rightParts = [
				...statusParts,
				theme.fg('dim', modelId),
				hubStatus,
			].filter(Boolean);
			const right = rightParts.join(theme.fg('muted', ' \u2502 '));

			return `${left}  ${right}`;
		};

		return new FooterText(getText, theme, footerData);
	});
}
