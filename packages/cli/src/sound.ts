import { join } from 'node:path';

export function playSound(): void {
	const platform = process.platform;

	let command: string[];
	switch (platform) {
		case 'darwin': {
			const items = [
				'Blow.aiff',
				'Bottle.aiff',
				'Frog.aiff',
				'Funk.aiff',
				'Glass.aiff',
				'Hero.aiff',
				'Morse.aiff',
				'Ping.aiff',
				'Pop.aiff',
				'Purr.aiff',
				'Sosumi.aiff',
			] as const;
			const file = items[Math.floor(Math.random() * items.length)];
			command = ['afplay', join('/System/Library/Sounds', file)];
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

	Bun.spawn(command, {
		stdio: ['ignore', 'ignore', 'ignore'],
	}).unref();
}
