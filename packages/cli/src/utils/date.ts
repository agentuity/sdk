/**
 * Parse duration string (e.g., "1h", "2d", "1y") or ISO date to ISO date string
 *
 * @param input - Duration string (1m, 1h, 2d, 1w, 1y) or ISO date (2025-12-31T23:59:59Z)
 * @returns ISO date string
 * @throws Error if input format is invalid
 *
 * @example
 * parseExpiresAt('1h') // Returns ISO date 1 hour from now
 * parseExpiresAt('30d') // Returns ISO date 30 days from now
 * parseExpiresAt('2025-12-31T23:59:59Z') // Returns same ISO date
 */
export function parseExpiresAt(input: string): string {
	// Check if it's already an ISO date format
	if (input.includes('T') || input.includes('-')) {
		// Validate it's a valid date
		const date = new Date(input);
		if (isNaN(date.getTime())) {
			throw new Error(`Invalid date format: ${input}`);
		}
		return date.toISOString();
	}

	// Parse duration format (e.g., "1h", "2d", "30d", "1y")
	const durationRegex = /^(\d+)(m|h|d|w|y)$/;
	const match = input.match(durationRegex);

	if (!match) {
		throw new Error(
			`Invalid expires-at format: ${input}. Use ISO date (2025-12-31T23:59:59Z) or duration (1h, 2d, 1y)`
		);
	}

	const [, amount, unit] = match;
	const num = parseInt(amount, 10);
	const now = new Date();

	switch (unit) {
		case 'm': // minutes
			now.setMinutes(now.getMinutes() + num);
			break;
		case 'h': // hours
			now.setHours(now.getHours() + num);
			break;
		case 'd': // days
			now.setDate(now.getDate() + num);
			break;
		case 'w': // weeks
			now.setDate(now.getDate() + num * 7);
			break;
		case 'y': // years
			now.setFullYear(now.getFullYear() + num);
			break;
	}

	return now.toISOString();
}
