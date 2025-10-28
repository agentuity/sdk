import { $ } from 'bun';

export async function playSound(): Promise<void> {
	const platform = process.platform;

	let result;
	switch (platform) {
		case 'darwin':
			result = await $`afplay /System/Library/Sounds/Glass.aiff`.quiet().nothrow();
			break;
		case 'linux':
			result = await $`paplay /usr/share/sounds/freedesktop/stereo/complete.oga`
				.quiet()
				.nothrow();
			break;
		case 'win32':
			result = await $`rundll32 user32.dll,MessageBeep 0x00000040`.quiet().nothrow();
			break;
	}

	// Fallback to terminal bell if command failed or platform unsupported
	if (!result || result.exitCode !== 0) {
		process.stdout.write('\u0007');
	}
}
