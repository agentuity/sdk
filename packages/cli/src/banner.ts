import { getVersion } from './version';
import { shouldUseColors, isDarkMode, link } from './tui';

export function generateBanner(version?: string, compact?: true): string {
	const _version = version ?? getVersion();
	const USE_COLORS = shouldUseColors();
	const dark = isDarkMode();
	const CYAN = USE_COLORS
		? dark
			? Bun.color('cyan', 'ansi-16m')
			: Bun.color('#008B8B', 'ansi-16m')
		: '';
	const WHITE = USE_COLORS
		? dark
			? Bun.color('white', 'ansi-16m')
			: Bun.color('black', 'ansi-16m')
		: '';
	const RESET = USE_COLORS ? '\x1b[0m' : '';

	const width = 52; // Content width between pipes
	const versionLabel = ' Version:        '; // Include leading space
	const versionPadding = width - versionLabel.length - 1; // Subtract 1 for the space before closing pipe

	const lines = [
		CYAN + '╭────────────────────────────────────────────────────╮' + RESET,
		CYAN + `│ ⨺ Agentuity  ${WHITE}The full-stack platform for AI agents${CYAN} │` + RESET,
		compact ? undefined : CYAN + '│                                                    │' + RESET,
		compact
			? undefined
			: CYAN + `│${versionLabel}${WHITE + _version.padEnd(versionPadding) + CYAN} │` + RESET,
		compact
			? undefined
			: CYAN +
				`│ Docs:           ${link('https://agentuity.dev', undefined, WHITE!)}${CYAN}              │` +
				RESET,
		compact
			? undefined
			: CYAN +
				`│ Community:      ${link('https://discord.gg/agentuity', undefined, WHITE!)}${CYAN}       │` +
				RESET,
		compact
			? undefined
			: CYAN +
				`│ Dashboard:      ${link('https://app-v1.agentuity.com', undefined, WHITE!)}${CYAN}       │` +
				RESET,
		CYAN + '╰────────────────────────────────────────────────────╯' + RESET,
	].filter(Boolean) as string[];

	return lines.join('\n');
}

export function showBanner(version?: string, compact?: true): void {
	console.log(generateBanner(version, compact));
}
