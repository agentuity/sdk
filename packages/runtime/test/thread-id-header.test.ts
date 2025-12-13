/**
 * Tests for thread ID support via x-thread-id HTTP header.
 */

import { test, expect, describe } from 'bun:test';
import {
	DefaultThreadIDProvider,
	isValidThreadId,
	isSecureConnection,
	signThreadId,
	verifySignedThreadId,
} from '../src/session';
import type { AppState } from '../src/index';

describe('Thread ID Header Support', () => {
	test('DefaultThreadIDProvider uses x-thread-id header when present and properly signed', async () => {
		const provider = new DefaultThreadIDProvider();
		let responseHeaderValue: string | undefined;
		const threadIdValue = 'thrd_12345678901234567890123456789012';
		const secret = 'agentuity';
		const signedHeader = await signThreadId(threadIdValue, secret);

		// Mock context with signed x-thread-id header
		const ctx = {
			req: {
				header: (name: string) => {
					if (name === 'x-thread-id') {
						return signedHeader;
					}
					return undefined;
				},
				raw: {
					headers: new Headers(),
				},
			},
			header: (name: string, value: string) => {
				if (name === 'x-thread-id') {
					responseHeaderValue = value;
				}
			},
			get: () => undefined,
			set: () => {},
			var: {},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any;

		const threadId = await provider.getThreadId({} as AppState, ctx);

		expect(threadId).toBe(threadIdValue);
		expect(responseHeaderValue).toContain(threadIdValue);
		expect(responseHeaderValue).toContain(';');
	});

	test('DefaultThreadIDProvider generates new ID when unsigned cookie present', async () => {
		const provider = new DefaultThreadIDProvider();
		let responseHeaderValue: string | undefined;

		// Mock context without header but with unsigned cookie (will be rejected)
		const cookieThreadId = 'thrd_cookie567890123456789012345678';
		const headers = new Headers();
		headers.set('Cookie', `atid=${cookieThreadId}`);

		const ctx = {
			req: {
				header: () => undefined,
				raw: {
					headers,
				},
			},
			header: (name: string, value: string) => {
				if (name === 'x-thread-id') {
					responseHeaderValue = value;
				}
			},
			get: () => undefined,
			set: () => {},
			var: {},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any;

		const threadId = await provider.getThreadId({} as AppState, ctx);

		// Should generate new ID since unsigned cookie won't validate
		expect(threadId).toMatch(/^thrd_[a-f0-9]{32}$/);
		expect(threadId).not.toBe(cookieThreadId);
		expect(responseHeaderValue).toContain(threadId);
		expect(responseHeaderValue).toContain(';');
	});

	test('DefaultThreadIDProvider generates new ID when neither header nor cookie present', async () => {
		const provider = new DefaultThreadIDProvider();
		let responseHeaderValue: string | undefined;

		// Mock context without header or cookie
		const ctx = {
			req: {
				header: () => undefined,
				raw: {
					headers: new Headers(),
				},
			},
			header: (name: string, value: string) => {
				if (name === 'x-thread-id') {
					responseHeaderValue = value;
				}
			},
			get: () => undefined,
			set: () => {},
			var: {},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any;

		const threadId = await provider.getThreadId({} as AppState, ctx);

		expect(threadId).toMatch(/^thrd_[a-f0-9]{32}$/);
		expect(responseHeaderValue).toContain(threadId);
		expect(responseHeaderValue).toContain(';');
	});

	test('DefaultThreadIDProvider prioritizes signed header over cookie', async () => {
		const provider = new DefaultThreadIDProvider();

		const headerThreadId = 'thrd_header67890123456789012345678901';
		const secret = 'agentuity';
		const signedHeader = await signThreadId(headerThreadId, secret);

		// Mock context with signed header
		const ctx = {
			req: {
				header: (name: string) => {
					if (name === 'x-thread-id') {
						return signedHeader;
					}
					return undefined;
				},
				raw: {
					headers: new Headers(),
				},
			},
			header: () => {},
			get: () => undefined,
			set: () => {},
			var: {},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any;

		const threadId = await provider.getThreadId({} as AppState, ctx);

		expect(threadId).toBe(headerThreadId);
	});

	test('DefaultThreadIDProvider ignores invalid header value', async () => {
		const provider = new DefaultThreadIDProvider();

		// Mock context with invalid header (doesn't start with thrd_)
		const ctx = {
			req: {
				header: (name: string) => {
					if (name === 'x-thread-id') {
						return 'invalid_12345678901234567890123456789';
					}
					return undefined;
				},
				raw: {
					headers: new Headers(),
				},
			},
			header: () => {},
			get: () => undefined,
			set: () => {},
			var: {},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any;

		const threadId = await provider.getThreadId({} as AppState, ctx);

		// Should generate new ID instead of using invalid header
		expect(threadId).toMatch(/^thrd_[a-f0-9]{32}$/);
		expect(threadId).not.toBe('invalid_12345678901234567890123456789');
	});
});

describe('Thread ID Validation', () => {
	test('isValidThreadId accepts valid thread IDs', () => {
		expect(isValidThreadId('thrd_1234567890123456789012345678')).toBe(true); // 32 chars total
		expect(isValidThreadId('thrd_abcdefghijklmnopqrstuvwxyz12')).toBe(true);
		expect(isValidThreadId('thrd_ABCDEFGHIJKLMNOPQRSTUVWXYZ12')).toBe(true);
		expect(isValidThreadId('thrd_abc123def456ghi789jkl1234567')).toBe(true);
	});

	test('isValidThreadId rejects thread IDs without thrd_ prefix', () => {
		expect(isValidThreadId('thread_1234567890123456789012')).toBe(false);
		expect(isValidThreadId('abc_12345678901234567890123456')).toBe(false);
		expect(isValidThreadId('12345678901234567890123456789012')).toBe(false);
	});

	test('isValidThreadId rejects thread IDs that are too short', () => {
		expect(isValidThreadId('thrd_123')).toBe(false);
		expect(isValidThreadId('thrd_12345678901234567890')).toBe(false);
		expect(isValidThreadId('thrd_1234567890123456789012345')).toBe(false); // 31 chars
	});

	test('isValidThreadId rejects thread IDs that are too long', () => {
		expect(isValidThreadId('thrd_' + 'a'.repeat(60))).toBe(false); // 65 chars
		expect(isValidThreadId('thrd_' + 'a'.repeat(100))).toBe(false);
	});

	test('isValidThreadId rejects thread IDs with invalid characters', () => {
		expect(isValidThreadId('thrd_abc!def123456789012345678')).toBe(false);
		expect(isValidThreadId('thrd_abc@def123456789012345678')).toBe(false);
		expect(isValidThreadId('thrd_abc#def123456789012345678')).toBe(false);
		expect(isValidThreadId('thrd_abc$def123456789012345678')).toBe(false);
		expect(isValidThreadId('thrd_abc%def123456789012345678')).toBe(false);
		expect(isValidThreadId('thrd_abc_def123456789012345678')).toBe(false); // underscore not allowed
		expect(isValidThreadId('thrd_abc.def123456789012345678')).toBe(false); // dot not allowed
		expect(isValidThreadId('thrd_abc def123456789012345678')).toBe(false); // space not allowed
		expect(isValidThreadId('thrd_abc-def123456789012345678')).toBe(false); // dash not allowed
	});

	test('DefaultThreadIDProvider rejects header with invalid length', async () => {
		const provider = new DefaultThreadIDProvider();

		// Too short
		const ctxShort = {
			req: {
				header: (name: string) => (name === 'x-thread-id' ? 'thrd_short' : undefined),
				raw: { headers: new Headers() },
			},
			header: () => {},
			get: () => undefined,
			set: () => {},
			var: {},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any;

		const shortThreadId = await provider.getThreadId({} as AppState, ctxShort);
		expect(shortThreadId).toMatch(/^thrd_[a-f0-9]{32}$/);
		expect(shortThreadId).not.toBe('thrd_short');
	});

	test('DefaultThreadIDProvider rejects cookie with invalid characters', async () => {
		const provider = new DefaultThreadIDProvider();

		const headers = new Headers();
		headers.set('Cookie', 'atid=thrd_invalid!@#$%^&*()123456789');

		const ctx = {
			req: {
				header: () => undefined,
				raw: { headers },
			},
			header: () => {},
			get: () => undefined,
			set: () => {},
			var: {},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any;

		const threadId = await provider.getThreadId({} as AppState, ctx);
		expect(threadId).toMatch(/^thrd_[a-f0-9]{32}$/);
		expect(threadId).not.toContain('invalid');
	});
});

describe('Connection Security Detection', () => {
	test('isSecureConnection returns true for HTTPS', () => {
		const ctx = {
			req: {
				url: 'https://example.com/path',
				header: () => undefined,
			},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any;

		expect(isSecureConnection(ctx)).toBe(true);
	});

	test('isSecureConnection returns false for HTTP', () => {
		const ctx = {
			req: {
				url: 'http://localhost:3000/path',
				header: () => undefined,
			},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any;

		expect(isSecureConnection(ctx)).toBe(false);
	});

	test('isSecureConnection respects x-forwarded-proto header (HTTPS)', () => {
		const ctx = {
			req: {
				url: 'http://internal-server/path',
				header: (name: string) => {
					if (name === 'x-forwarded-proto') {
						return 'https';
					}
					return undefined;
				},
			},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any;

		expect(isSecureConnection(ctx)).toBe(true);
	});

	test('isSecureConnection respects x-forwarded-proto header (HTTP)', () => {
		const ctx = {
			req: {
				url: 'https://example.com/path',
				header: (name: string) => {
					if (name === 'x-forwarded-proto') {
						return 'http';
					}
					return undefined;
				},
			},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any;

		expect(isSecureConnection(ctx)).toBe(false);
	});
});

describe('Thread ID Signing and Verification', () => {
	test('signThreadId creates properly formatted signed header', async () => {
		const threadId = 'thrd_1234567890123456789012345678';
		const secret = 'test-secret';
		const signed = await signThreadId(threadId, secret);

		expect(signed).toContain(';');
		const parts = signed.split(';');
		expect(parts).toHaveLength(2);
		expect(parts[0]).toBe(threadId);
		expect(parts[1]).toMatch(/^[A-Za-z0-9+/]+=*$/); // Base64 pattern
	});

	test('verifySignedThreadId accepts valid signature', async () => {
		const threadId = 'thrd_1234567890123456789012345678';
		const secret = 'test-secret';
		const signed = await signThreadId(threadId, secret);

		const verified = await verifySignedThreadId(signed, secret);
		expect(verified).toBe(threadId);
	});

	test('verifySignedThreadId rejects tampered thread ID', async () => {
		const threadId = 'thrd_1234567890123456789012345678';
		const secret = 'test-secret';
		const signed = await signThreadId(threadId, secret);

		// Tamper with the thread ID part
		const tamperedSignature = signed.split(';')[1];
		const tampered = `thrd_9999999999999999999999999999;${tamperedSignature}`;

		const verified = await verifySignedThreadId(tampered, secret);
		expect(verified).toBeUndefined();
	});

	test('verifySignedThreadId rejects tampered signature', async () => {
		const threadId = 'thrd_1234567890123456789012345678';
		const secret = 'test-secret';

		// Tamper with the signature part
		const tampered = `${threadId};tampered_signature_here`;

		const verified = await verifySignedThreadId(tampered, secret);
		expect(verified).toBeUndefined();
	});

	test('verifySignedThreadId rejects wrong secret', async () => {
		const threadId = 'thrd_1234567890123456789012345678';
		const signed = await signThreadId(threadId, 'secret1');

		const verified = await verifySignedThreadId(signed, 'secret2');
		expect(verified).toBeUndefined();
	});

	test('verifySignedThreadId rejects invalid format', async () => {
		const secret = 'test-secret';

		// No semicolon
		expect(
			await verifySignedThreadId('thrd_123456789012345678901234567', secret)
		).toBeUndefined();

		// Multiple semicolons
		expect(
			await verifySignedThreadId('thrd_123456789012345678901234567;sig1;sig2', secret)
		).toBeUndefined();

		// Empty parts
		expect(await verifySignedThreadId(';signature', secret)).toBeUndefined();
		expect(
			await verifySignedThreadId('thrd_123456789012345678901234567;', secret)
		).toBeUndefined();
	});

	test('DefaultThreadIDProvider rejects unsigned header', async () => {
		const provider = new DefaultThreadIDProvider();

		// Mock context with unsigned header (no signature part)
		const ctx = {
			req: {
				header: (name: string) => {
					if (name === 'x-thread-id') {
						return 'thrd_12345678901234567890123456789012';
					}
					return undefined;
				},
				raw: {
					headers: new Headers(),
				},
			},
			header: () => {},
			get: () => undefined,
			set: () => {},
			var: {},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any;

		const threadId = await provider.getThreadId({} as AppState, ctx);

		// Should generate new ID since header is not signed
		expect(threadId).toMatch(/^thrd_[a-f0-9]{32}$/);
		expect(threadId).not.toBe('thrd_12345678901234567890123456789012');
	});

	test('DefaultThreadIDProvider rejects header with invalid signature', async () => {
		const provider = new DefaultThreadIDProvider();

		// Create header with wrong signature
		const threadIdValue = 'thrd_12345678901234567890123456789012';
		const invalidSigned = `${threadIdValue};invalidSignatureHere`;

		const ctx = {
			req: {
				header: (name: string) => {
					if (name === 'x-thread-id') {
						return invalidSigned;
					}
					return undefined;
				},
				raw: {
					headers: new Headers(),
				},
			},
			header: () => {},
			get: () => undefined,
			set: () => {},
			var: {},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any;

		const threadId = await provider.getThreadId({} as AppState, ctx);

		// Should generate new ID since signature is invalid
		expect(threadId).toMatch(/^thrd_[a-f0-9]{32}$/);
		expect(threadId).not.toBe(threadIdValue);
	});
});
