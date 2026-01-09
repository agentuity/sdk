/**
 * Shared utility functions
 */

/**
 * Format ISO timestamp to a human-readable format.
 * Note: This runs on the server, so timezone is server's timezone.
 */
export function formatTimestamp(isoString: string): string {
	const date = new Date(isoString);
	const now = new Date();
	const isToday = date.toDateString() === now.toDateString();

	if (isToday) {
		return date.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			second: '2-digit',
			hour12: true,
		});
	}

	return date.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
	});
}

/**
 * Format any ISO timestamps found in an object's values.
 * Returns a new object with timestamps converted to readable format.
 */
export function formatTimestamps(obj: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj)) {
		if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
			result[key] = formatTimestamp(value);
		} else {
			result[key] = value;
		}
	}
	return result;
}
