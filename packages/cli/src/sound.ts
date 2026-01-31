export function playSound(): void {
	const platform = process.platform;

	let command: string[];
	switch (platform) {
		case 'darwin': {
			command = ['afplay', '/System/Library/Sounds/Blow.aiff'];
			break;
		}
		case 'linux':
			command = ['paplay', '/usr/share/sounds/freedesktop/stereo/complete.oga'];
			break;
		case 'win32':
			command = ['rundll32', 'user32.dll,MessageBeep', '0x00000040'];
			break;
		default:
			return;
	}

	const executable = command[0];
	if (process.stdout.isTTY && executable && Bun.which(executable)) {
		try {
			Bun.spawn(command, {
				stdio: ['ignore', 'ignore', 'ignore'],
			}).unref();
		} catch {
			/* ignore */
		}
	}
}
