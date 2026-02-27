/**
 * Coder header for the Pi TUI.
 *
 * Shows the Agentuity brand, session title, and token stats
 * (input/output/cost) right-aligned.
 */

import type { ExtensionContext, Theme } from '@mariozechner/pi-coding-agent';

// ──────────────────────────────────────────────
// Minimal component — avoids importing @mariozechner/pi-tui directly.
// ──────────────────────────────────────────────

class HeaderText {
	private getText: (width: number) => string;

	constructor(getText: (width: number) => string) {
		this.getText = getText;
	}

	render(width: number): string[] {
		const text = this.getText(width);
		return [text.length > width ? text.slice(0, width) : text];
	}

	invalidate(): void {
		// no-op
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

/** Strip ANSI escape sequences to get visible character count. */
function visibleLength(str: string): number {
	// eslint-disable-next-line no-control-regex
	return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Set up the Coder header. Call this once with the extension context
 * (from a session_start handler or similar) to replace Pi's default header.
 *
 * Design: `\u2A3A  Agentuity > Session Title Here                    \u2191input \u2193output $cost`
 *
 * @param ctx  Extension context with UI access
 */
export function setupCoderHeader(ctx: ExtensionContext): void {
	if (!ctx.hasUI) return;

	ctx.ui.setHeader((_tui, theme) => {
		const getText = (width: number): string => {
			// ── Left side: brand + session label ──
			const brand = theme.fg('accent', '\u2A3A  Agentuity');
			const separator = theme.fg('dim', ' > ');

			// Try to get session label from session manager
			let sessionLabel = 'New Session';
			try {
				const entries = ctx.sessionManager.getBranch();
				// Look for the first user message to use as a label
				for (const e of entries) {
					if (e.type === 'message' && e.message && 'role' in e.message) {
						const msg = e.message as { role: string; content?: string };
						if (msg.role === 'user' && msg.content) {
							// Use first 40 chars of first user message as label
							sessionLabel = msg.content.length > 40
								? msg.content.slice(0, 39) + '\u2026'
								: msg.content;
							// Remove newlines
							sessionLabel = sessionLabel.replace(/\n/g, ' ');
							break;
						}
					}
				}
			} catch {
				// Fall back to default
			}

			const label = theme.fg('text', sessionLabel);
			const left = brand + separator + label;

			// ── Right side: token stats ──
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

			const tokensStr = `\u2191${formatTokens(input)} \u2193${formatTokens(output)} ${formatCost(cost)}`;
			const right = theme.fg('muted', tokensStr);

			// ── Right-align with padding ──
			const leftLen = visibleLength(left);
			const rightLen = visibleLength(right);
			const gap = Math.max(1, width - leftLen - rightLen);
			const padding = ' '.repeat(gap);

			return left + padding + right;
		};

		return new HeaderText(getText);
	});
}
