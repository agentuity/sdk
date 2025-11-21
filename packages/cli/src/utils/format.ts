/**
 * Abbreviate a string to a maximum length, adding ellipsis if truncated
 */
export function abbreviate(str: string | null | undefined, maxLength = 8): string {
	if (!str) return 'N/A';
	if (str.length <= maxLength) return str;
	return str.slice(0, maxLength) + '...';
}

/**
 * Abbreviate a description (longer default length)
 */
export function abbreviateDescription(str: string | null | undefined, maxLength = 40): string {
	if (!str) return 'N/A';
	if (str.length <= maxLength) return str;
	return str.slice(0, maxLength) + '...';
}
