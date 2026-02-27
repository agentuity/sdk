/**
 * Powerline-style Coder footer for the Pi TUI.
 *
 * Design: `\u2A3A  > model-or-agent > branch > \u25A0     ctrl+e expand  ctrl+c cancel  v1.0.22`
 *
 * Segments (left to right):
 * 1. Brand mark (\u2A3A) in accent
 * 2. Active agent name (accent) when agent is running, OR model ID (text) when idle
 * 3. Git branch in muted
 * 4. Hub status indicator (\u25A0) — green if connected, red if not
 * 5. Right-aligned: keyboard shortcuts + version
 */

import type {
	ExtensionContext,
	ReadonlyFooterDataProvider,
	Theme,
} from '@mariozechner/pi-coding-agent';

const VERSION = '1.0.22';

// ──────────────────────────────────────────────
// Minimal component — avoids importing @mariozechner/pi-tui directly.
// ──────────────────────────────────────────────

class FooterComponent {
	private getText: (width: number) => string;
	private _unsubscribeBranch?: () => void;

	constructor(
		getText: (width: number) => string,
		footerData: ReadonlyFooterDataProvider,
	) {
		this.getText = getText;
		// Re-render on branch changes
		this._unsubscribeBranch = footerData.onBranchChange(() => {
			// Triggers TUI refresh
		});
	}

	render(width: number): string[] {
		const text = this.getText(width);
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
// Helpers
// ──────────────────────────────────────────────

/** Strip ANSI escape sequences to get visible character count. */
function visibleLength(str: string): number {
	// eslint-disable-next-line no-control-regex
	return str.replace(/\x1b\[[0-9;]*m/g, '').length;
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

	ctx.ui.setFooter((_tui, theme, footerData) => {
		const getText = (width: number): string => {
			// ── Left side: powerline segments ──
			const parts: string[] = [];

			// 1. Brand mark
			parts.push(theme.fg('accent', '\u2A3A '));

			// 2. Separator + Active agent or Model
			parts.push(theme.fg('dim', ' > '));
			const activeAgent = footerData.getExtensionStatuses().get('active_agent');
			if (activeAgent) {
				parts.push(theme.fg('accent', activeAgent));
			} else {
				const modelId = ctx.model
					? String((ctx.model as { id?: string }).id ?? '?')
					: '?';
				parts.push(theme.fg('text', modelId));
			}

			// 3. Separator + Git branch (if available)
			const branch = footerData.getGitBranch();
			if (branch) {
				parts.push(theme.fg('dim', ' > '));
				parts.push(theme.fg('muted', branch));
			}

			// 4. Separator + Hub status
			parts.push(theme.fg('dim', ' > '));
			const hubIndicator = isHubConnected()
				? theme.fg('success', '\u25A0')
				: theme.fg('error', '\u25A0');
			parts.push(hubIndicator);

			const left = parts.join('');

			// ── Right side: shortcuts + version ──
			const shortcuts = theme.fg('dim', 'ctrl+e expand  ctrl+c cancel');
			const version = theme.fg('dim', `v${VERSION}`);
			const right = shortcuts + '  ' + version;

			// ── Fill middle with spaces ──
			const leftLen = visibleLength(left);
			const rightLen = visibleLength(right);
			const gap = Math.max(1, width - leftLen - rightLen);
			const padding = ' '.repeat(gap);

			return left + padding + right;
		};

		return new FooterComponent(getText, footerData);
	});
}
