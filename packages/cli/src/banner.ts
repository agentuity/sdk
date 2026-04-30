import { color } from './node-compat/ansi.ts';
import { getVersion, getReleaseUrl } from './version.ts';
import {
	shouldUseColors,
	isDarkMode,
	link,
	supportsHyperlinks,
	getDisplayWidth,
	stripAnsi,
} from './tui.ts';
import { getExecutingAgent } from './agent-detection.ts';

export function generateBanner(version?: string, compact?: true): string {
	const _version = version ?? getVersion();
	const USE_COLORS = shouldUseColors();
	const dark = isDarkMode();
	const CYAN = USE_COLORS ? (dark ? color('cyan', 'ansi-16m') : color('#008B8B', 'ansi-16m')) : '';
	const WHITE = USE_COLORS ? (dark ? color('white', 'ansi-16m') : color('black', 'ansi-16m')) : '';
	const RESET = USE_COLORS ? '\x1b[0m' : '';
	const LINKS = supportsHyperlinks();

	const width = 52; // Content width between pipes
	const versionLabel = ' Version:        '; // Include leading space
	const versionLink = LINKS
		? link(getReleaseUrl(_version), _version, WHITE ?? undefined)
		: WHITE + _version + RESET;
	const versionLinkWidth = getDisplayWidth(stripAnsi(versionLink));
	const versionPadding = width - versionLabel.length - versionLinkWidth - 1;

	const docsLabel = ' Docs:           ';
	const docsLink = LINKS
		? link('https://agentuity.dev', 'agentuity.dev', WHITE!)
		: WHITE + 'https://agentuity.dev' + RESET;
	const docsWidth = getDisplayWidth(stripAnsi(docsLink));
	const docsPadding = width - docsLabel.length - docsWidth - 1;

	const communityLabel = ' Community:      ';
	const communityLink = LINKS
		? link('https://discord.gg/agentuity', 'discord.gg/agentuity', WHITE!)
		: WHITE + 'https://discord.gg/agentuity' + RESET;
	const communityWidth = getDisplayWidth(stripAnsi(communityLink));
	const communityPadding = width - communityLabel.length - communityWidth - 1;

	const dashboardLabel = ' Dashboard:      ';
	const dashboardLink = LINKS
		? link('https://app.agentuity.com', 'app.agentuity.com', WHITE!)
		: WHITE + 'https://app.agentuity.com' + RESET;
	const dashboardWidth = getDisplayWidth(stripAnsi(dashboardLink));
	const dashboardPadding = width - dashboardLabel.length - dashboardWidth - 1;

	const lines = [
		CYAN + '╭────────────────────────────────────────────────────╮' + RESET,
		CYAN + `│ ⨺ Agentuity  ${WHITE}The full-stack platform for AI agents${CYAN} │` + RESET,
		compact ? undefined : CYAN + '│                                                    │' + RESET,
		compact
			? undefined
			: CYAN +
				`│${versionLabel}${WHITE + versionLink + ''.padEnd(versionPadding) + CYAN} │` +
				RESET,
		compact
			? undefined
			: CYAN + `│${docsLabel}${docsLink + ''.padEnd(docsPadding) + CYAN} │` + RESET,
		compact
			? undefined
			: CYAN +
				`│${communityLabel}${communityLink + ''.padEnd(communityPadding) + CYAN} │` +
				RESET,
		compact
			? undefined
			: CYAN +
				`│${dashboardLabel}${dashboardLink + ''.padEnd(dashboardPadding) + CYAN} │` +
				RESET,
		CYAN + '╰────────────────────────────────────────────────────╯' + RESET,
	].filter(Boolean) as string[];

	return lines.join('\n');
}

export function showBanner(version?: string, compact?: true): void {
	// Skip banner when running from an AI coding agent
	if (getExecutingAgent()) {
		return;
	}
	console.log(generateBanner(version, compact));
}
