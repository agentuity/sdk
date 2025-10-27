export type ColorScheme = 'light' | 'dark';

export async function detectColorScheme(): Promise<ColorScheme> {
	const debug = process.env.DEBUG_COLORS === 'true';

	// Check for explicit override
	if (process.env.COLOR_SCHEME === 'light') {
		if (debug) console.log('[DEBUG] Using COLOR_SCHEME=light override');
		return 'light';
	}
	if (process.env.COLOR_SCHEME === 'dark') {
		if (debug) console.log('[DEBUG] Using COLOR_SCHEME=dark override');
		return 'dark';
	}

	// Check if we have stdout TTY at minimum
	if (!process.stdout.isTTY) {
		if (debug) console.log('[DEBUG] stdout not a TTY, defaulting to dark');
		return 'dark'; // Default to dark mode
	}

	// Try to query terminal background color using OSC 11 (most reliable)
	if (debug) console.log('[DEBUG] Querying terminal background with OSC 11...');
	try {
		const bgColor = await queryTerminalBackground();
		if (bgColor) {
			const luminance = calculateLuminance(bgColor);
			const scheme = luminance > 0.5 ? 'light' : 'dark';
			if (debug)
				console.log(
					`[DEBUG] OSC 11 response: rgb(${bgColor.r},${bgColor.g},${bgColor.b}), luminance: ${luminance.toFixed(2)}, scheme: ${scheme}`
				);
			return scheme;
		} else {
			if (debug) console.log('[DEBUG] OSC 11 query timed out or no response');
		}
	} catch (error) {
		if (debug) console.log('[DEBUG] OSC 11 query failed:', error);
	}

	// Fall back to COLORFGBG environment variable (less reliable)
	if (process.env.COLORFGBG) {
		// COLORFGBG format is "foreground;background"
		// This is unreliable but better than nothing
		const parts = process.env.COLORFGBG.split(';');
		const fg = parseInt(parts[0] || '7', 10);
		const bg = parseInt(parts[1] || '0', 10);

		// Heuristic: if background is 0 (black) and foreground is light (>=7), it's likely dark mode
		// if background is light (>=7) and foreground is dark (<7), it's likely light mode
		const scheme = bg >= 7 || bg > fg ? 'light' : 'dark';
		if (debug)
			console.log(
				`[DEBUG] COLORFGBG fallback: ${process.env.COLORFGBG} (fg:${fg}, bg:${bg}), scheme: ${scheme}`
			);
		return scheme;
	}

	if (debug) console.log('[DEBUG] Defaulting to dark mode');
	return 'dark'; // Default to dark mode
}

interface RGBColor {
	r: number;
	g: number;
	b: number;
}

async function queryTerminalBackground(): Promise<RGBColor | null> {
	// Skip if stdin is not available or not a TTY
	if (!process.stdin.isTTY) {
		return null;
	}

	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			cleanup();
			resolve(null);
		}, 100); // 100ms timeout

		let response = '';

		const onData = (data: Buffer) => {
			response += data.toString();

			// Look for OSC 11 response patterns:
			// Pattern 1: ESC ] 11 ; rgb:RRRR/GGGG/BBBB ESC \ (xterm with ESC \ terminator)
			// Pattern 2: ESC ] 11 ; rgb:RRRR/GGGG/BBBB BEL (xterm with BEL terminator)
			// The color values can be 8-bit (RR), 12-bit (RRR), or 16-bit (RRRR)
			// biome-ignore lint/suspicious/noControlCharactersInRegex: Control characters needed for ANSI escape sequences
			const match = response.match(
				// eslint-disable-next-line no-control-regex
				/\x1b\]11;rgb:([0-9a-f]+)\/([0-9a-f]+)\/([0-9a-f]+)(?:\x1b\\|\x07)/i
			);
			if (match) {
				cleanup();
				clearTimeout(timeout);

				// Parse RGB values - they can be different bit depths
				// Normalize to 8-bit (0-255) by taking the most significant bits
				const parseColorValue = (hex: string): number => {
					if (hex.length === 4) {
						// 16-bit: RRRR -> take first 2 chars
						return parseInt(hex.slice(0, 2), 16);
					} else if (hex.length === 3) {
						// 12-bit: RRR -> take first 2 chars
						return parseInt(hex.slice(0, 2), 16);
					} else {
						// 8-bit: RR
						return parseInt(hex, 16);
					}
				};

				const r = parseColorValue(match[1]);
				const g = parseColorValue(match[2]);
				const b = parseColorValue(match[3]);

				resolve({ r, g, b });
			}
		};

		const cleanup = () => {
			process.stdin.setRawMode(false);
			process.stdin.removeListener('data', onData);
			process.stdin.pause(); // Pause stdin to allow process to exit
		};

		// Set stdin to raw mode to read escape sequences
		process.stdin.setRawMode(true);
		process.stdin.resume(); // Resume to receive data
		process.stdin.on('data', onData);

		// Send OSC 11 query with BEL terminator (more widely supported)
		// Using BEL (\x07) as terminator instead of ESC \ for better compatibility
		process.stdout.write('\x1b]11;?\x07');
	});
}

function calculateLuminance(color: RGBColor): number {
	// Convert RGB to relative luminance using the formula from WCAG
	// https://www.w3.org/TR/WCAG20/#relativeluminancedef
	const rsRGB = color.r / 255;
	const gsRGB = color.g / 255;
	const bsRGB = color.b / 255;

	const r = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
	const g = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
	const b = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);

	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
