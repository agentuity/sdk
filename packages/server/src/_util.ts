import type { Context } from 'hono';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function returnResponse(ctx: Context, result: any) {
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
	val.forEach((val) => hasher.update(val));
	return hasher.digest().toHex();
}
