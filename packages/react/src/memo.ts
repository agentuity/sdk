import { useRef } from 'react';
<<<<<<< Updated upstream
import { jsonEqual } from '@agentuity/frontend';
=======
import { jsonEqual } from '@agentuity/web';
>>>>>>> Stashed changes

/**
 * Hook to memoize a value based on JSON equality instead of reference equality.
 * Prevents unnecessary re-renders when data hasn't actually changed.
 */
export function useJsonMemo<T>(value: T): T {
	const ref = useRef<T>(value);

	if (!jsonEqual(ref.current, value)) {
		ref.current = value;
	}

	return ref.current;
}
