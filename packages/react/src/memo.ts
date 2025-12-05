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

/**
 * Hook to memoize a value based on JSON equality instead of reference equality.
 * Prevents unnecessary re-renders when data hasn't actually changed.
 */
import { useRef } from 'react';

export function useJsonMemo<T>(value: T): T {
	const ref = useRef<T>(value);

	if (!jsonEqual(ref.current, value)) {
		ref.current = value;
	}

	return ref.current;
}
