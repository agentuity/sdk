import { getVersion } from './version';
import { shouldUseColors, isDarkMode } from './tui';

export function showBanner(version?: string): void {
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
		'╭────────────────────────────────────────────────────╮',
		`│ ⨺ Agentuity     ${WHITE}Build, manage and deploy AI agents${CYAN} │`,
		'│                                                    │',
		`│${versionLabel}${_version.padEnd(versionPadding)} │`,
		'│ Docs:           https://agentuity.dev              │',
		'│ Community:      https://discord.gg/agentuity       │',
		'│ Dashboard:      https://app.agentuity.com          │',
		'╰────────────────────────────────────────────────────╯',
	];

	console.log('');
	lines.forEach((line) => console.log(CYAN + line + RESET));
	console.log('');
}
