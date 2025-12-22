/**
 * Simple JSON-based equality check for memoization.
 * Compares stringified JSON to avoid deep equality overhead.
 */
export function jsonEqual<T>(a: T, b: T): boolean {
	if (a === b) return true;
	if (a === undefined || b === undefined) return false;
	if (a === null || b === null) return a === b;

	try {
		return JSON.stringify(a) === JSON.stringify(b);
	} catch {
		// Fallback for non-serializable values
		return false;
	}
}
