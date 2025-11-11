import type { Context } from 'hono';

export function returnResponse(ctx: Context, result: unknown) {
	if (result instanceof ReadableStream) return ctx.body(result);
	if (result instanceof Response) return result;
	if (typeof result === 'string') return ctx.text(result);
	if (typeof result === 'number' || typeof result === 'boolean') return ctx.text(String(result));
	return ctx.json(result);
}

/**
 * SHA256 hash of the given values
 *
 * @param val one or more strings to hash
 * @returns hash string in hex format
 */
export function hash(...val: string[]): string {
	const hasher = new Bun.CryptoHasher('sha256');
	val.map((val) => hasher.update(val));
	return hasher.digest().toHex();
}

/**
 * Safely stringify an object to JSON, handling circular references
 * @param obj - The object to stringify
 * @returns JSON string representation
 */
export function safeStringify(obj: unknown): string {
	const stack: unknown[] = [];

	function replacer(_key: string, value: unknown): unknown {
		if (typeof value === 'bigint') {
			return value.toString();
		}

		if (typeof value === 'object' && value !== null) {
			// Check if this object is already in our ancestor chain
			if (stack.includes(value)) {
				return '[Circular]';
			}

			// Add to stack before processing
			stack.push(value);

			// Process the object
			const result = Array.isArray(value) ? [] : {};

			for (const [k, v] of Object.entries(value)) {
				(result as Record<string, unknown>)[k] = replacer(k, v);
			}

			// Remove from stack after processing
			stack.pop();

			return result;
		}

		return value;
	}

	return JSON.stringify(replacer('', obj));
}
