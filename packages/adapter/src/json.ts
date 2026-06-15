/**
 * Safely stringify an object to JSON, handling circular references
 * @param obj - The object to stringify
 * @returns JSON string representation
 */
export function safeStringify(obj: unknown, space?: number | string): string {
	const visited = new WeakSet();

	function replacer(_key: string, value: unknown): unknown {
		if (typeof value === 'bigint') {
			return value.toString();
		}

		if (typeof value === 'object' && value !== null) {
			if (visited.has(value)) {
				return '[Circular]';
			}
			visited.add(value);
			return value;
		}

		return value;
	}

	return JSON.stringify(obj, replacer, space);
}
