import { getVersion } from './version';

export function showBanner(version?: string): void {
	const _version = version ?? getVersion();
	const CYAN = Bun.color('cyan', 'ansi-16m');
	const RESET = '\x1b[0m';

	const width = 52; // Content width between pipes
	const versionLabel = ' Version:        '; // Include leading space
	const versionPadding = width - versionLabel.length - 1; // Subtract 1 for the space before closing pipe

	const lines = [
		'╭────────────────────────────────────────────────────╮',
		'│ ⨺ Agentuity     Build, manage and deploy AI agents │',
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
