import { describe, test, expect, beforeAll } from 'bun:test';
import { generateKeyPairSync, KeyObject } from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import { encryptFIPSKEMDEMStream, decryptFIPSKEMDEMStream } from './box';

function createReadableStream(data: Buffer): Readable {
	return Readable.from([data]);
}

class CollectorStream extends Writable {
	private chunks: Buffer[] = [];

	_write(chunk: Buffer, _encoding: string, callback: () => void): void {
		this.chunks.push(chunk);
		callback();
	}

	getData(): Buffer {
		return Buffer.concat(this.chunks);
	}
}

function generateP256KeyPair(): { publicKey: KeyObject; privateKey: KeyObject } {
	return generateKeyPairSync('ec', {
		namedCurve: 'prime256v1',
	});
}

function generateP384KeyPair(): { publicKey: KeyObject; privateKey: KeyObject } {
	return generateKeyPairSync('ec', {
		namedCurve: 'secp384r1',
	});
}

describe('crypto/box', () => {
	describe('TestBasicEncryptDecrypt', () => {
		let keyPair: { publicKey: KeyObject; privateKey: KeyObject };

		beforeAll(() => {
			keyPair = generateP256KeyPair();
		});

		const testCases = [
			{ name: 'empty', data: Buffer.alloc(0) },
			{ name: 'small', data: Buffer.from('hello world') },
			{ name: 'medium', data: Buffer.alloc(1000).fill('A') },
			{ name: 'large', data: Buffer.alloc(100000).fill('B') },
			{ name: 'exactly_one_frame', data: Buffer.alloc(64 * 1024).fill('C') },
			{ name: 'just_over_one_frame', data: Buffer.alloc(64 * 1024 + 1).fill('D') },
		];

		for (const tc of testCases) {
			test(tc.name, async () => {
				const src = createReadableStream(tc.data);
				const encrypted = new CollectorStream();
				const written = await encryptFIPSKEMDEMStream(keyPair.publicKey, src, encrypted);

				expect(written).toBe(tc.data.length);

				const encryptedData = encrypted.getData();
				const decryptSrc = createReadableStream(encryptedData);
				const decrypted = new CollectorStream();
				const read = await decryptFIPSKEMDEMStream(keyPair.privateKey, decryptSrc, decrypted);

				expect(read).toBe(tc.data.length);

				const decryptedData = decrypted.getData();
				expect(decryptedData.equals(tc.data)).toBe(true);
			});
		}
	});

	describe('TestDifferentKeys', () => {
		test('should fail to decrypt with wrong key', async () => {
			const keyPair1 = generateP256KeyPair();
			const keyPair2 = generateP256KeyPair();

			const data = Buffer.from('test data');

			const src = createReadableStream(data);
			const encrypted = new CollectorStream();
			await encryptFIPSKEMDEMStream(keyPair1.publicKey, src, encrypted);

			const encryptedData = encrypted.getData();
			const decryptSrc = createReadableStream(encryptedData);
			const decrypted = new CollectorStream();

			await expect(
				decryptFIPSKEMDEMStream(keyPair2.privateKey, decryptSrc, decrypted)
			).rejects.toThrow('DEK unwrap failed');
		});
	});

	describe('TestMalformedHeaders', () => {
		let keyPair: { publicKey: KeyObject; privateKey: KeyObject };

		beforeAll(() => {
			keyPair = generateP256KeyPair();
		});

		const testCases = [
			{ name: 'empty', data: Buffer.alloc(0), err: 'unexpected EOF' },
			{ name: 'partial_len', data: Buffer.from([0]), err: 'unexpected EOF' },
			{
				name: 'invalid_wrapped_len',
				data: Buffer.from([0x10, 0x00]),
				err: 'invalid wrapped DEK length',
			},
			{ name: 'zero_len', data: Buffer.from([0x00, 0x00]), err: 'invalid wrapped DEK length' },
		];

		for (const tc of testCases) {
			test(tc.name, async () => {
				const src = createReadableStream(tc.data);
				const decrypted = new CollectorStream();

				await expect(
					decryptFIPSKEMDEMStream(keyPair.privateKey, src, decrypted)
				).rejects.toThrow(tc.err);
			});
		}
	});

	describe('TestMalformedChunks', () => {
		test('should fail authentication for malformed chunk', async () => {
			const keyPair = generateP256KeyPair();

			const buf = Buffer.alloc(2 + 113 + 12 + 2 + 32);
			let offset = 0;

			buf.writeUInt16BE(113, offset); // reasonable wrapped length (65+32+16)
			offset += 2;
			offset += 113;
			offset += 12;

			buf.writeUInt16BE(32, offset); // reasonable chunk size
			offset += 2;

			const src = createReadableStream(buf);
			const decrypted = new CollectorStream();

			await expect(
				decryptFIPSKEMDEMStream(keyPair.privateKey, src, decrypted)
			).rejects.toThrow();
		});
	});

	describe('TestStreamEOF', () => {
		test('should handle empty stream', async () => {
			const keyPair = generateP256KeyPair();

			const src = createReadableStream(Buffer.alloc(0));
			const encrypted = new CollectorStream();

			const written = await encryptFIPSKEMDEMStream(keyPair.publicKey, src, encrypted);
			expect(written).toBe(0);

			const encryptedData = encrypted.getData();
			const decryptSrc = createReadableStream(encryptedData);
			const decrypted = new CollectorStream();

			const read = await decryptFIPSKEMDEMStream(keyPair.privateKey, decryptSrc, decrypted);
			expect(read).toBe(0);
		});
	});

	describe('TestNonceReuseProtection', () => {
		test('different encryptions should produce different ciphertexts', async () => {
			const keyPair = generateP256KeyPair();
			const data = Buffer.from('test data for nonce reuse protection');

			const src1 = createReadableStream(data);
			const encrypted1 = new CollectorStream();
			await encryptFIPSKEMDEMStream(keyPair.publicKey, src1, encrypted1);

			const src2 = createReadableStream(data);
			const encrypted2 = new CollectorStream();
			await encryptFIPSKEMDEMStream(keyPair.publicKey, src2, encrypted2);

			const enc1Data = encrypted1.getData();
			const enc2Data = encrypted2.getData();
			expect(enc1Data.equals(enc2Data)).toBe(false);

			const decryptSrc1 = createReadableStream(enc1Data);
			const decrypted1 = new CollectorStream();
			await decryptFIPSKEMDEMStream(keyPair.privateKey, decryptSrc1, decrypted1);

			const decryptSrc2 = createReadableStream(enc2Data);
			const decrypted2 = new CollectorStream();
			await decryptFIPSKEMDEMStream(keyPair.privateKey, decryptSrc2, decrypted2);

			expect(decrypted1.getData().equals(data)).toBe(true);
			expect(decrypted2.getData().equals(data)).toBe(true);
		});
	});

	describe('TestFrameSizeBoundaries', () => {
		let keyPair: { publicKey: KeyObject; privateKey: KeyObject };

		beforeAll(() => {
			keyPair = generateP256KeyPair();
		});

		const FRAME = 65519;
		const testCases = [
			{ name: 'exactly_max_frame', size: FRAME },
			{ name: 'max_frame_minus_1', size: FRAME - 1 },
			{ name: 'max_frame_plus_1', size: FRAME + 1 },
			{ name: 'half_frame', size: Math.floor(FRAME / 2) },
			{ name: 'double_frame', size: FRAME * 2 },
		];

		for (const tc of testCases) {
			test(tc.name, async () => {
				const data = Buffer.alloc(tc.size).fill('A');

				const src = createReadableStream(data);
				const encrypted = new CollectorStream();
				const written = await encryptFIPSKEMDEMStream(keyPair.publicKey, src, encrypted);

				expect(written).toBe(tc.size);

				const encryptedData = encrypted.getData();
				const decryptSrc = createReadableStream(encryptedData);
				const decrypted = new CollectorStream();
				const read = await decryptFIPSKEMDEMStream(keyPair.privateKey, decryptSrc, decrypted);

				expect(read).toBe(tc.size);

				const decryptedData = decrypted.getData();
				expect(decryptedData.equals(data)).toBe(true);
			});
		}
	});

	describe('TestUint16OverflowProtection', () => {
		test('should not overflow with maximum frame size', async () => {
			const FRAME = 65519;
			const GCM_TAG = 16;

			const maxExpected = FRAME + GCM_TAG;
			expect(maxExpected).toBeLessThanOrEqual(0xffff);

			const keyPair = generateP256KeyPair();
			const data = Buffer.alloc(FRAME).fill('B');

			const src = createReadableStream(data);
			const encrypted = new CollectorStream();

			await expect(encryptFIPSKEMDEMStream(keyPair.publicKey, src, encrypted)).resolves.toBe(
				FRAME
			);
		});
	});

	describe('TestUnsupportedCurves', () => {
		test('should reject P-384 keys', async () => {
			const keyPair384 = generateP384KeyPair();
			const data = Buffer.from('test data');

			const src = createReadableStream(data);
			const encrypted = new CollectorStream();

			await expect(
				encryptFIPSKEMDEMStream(keyPair384.publicKey, src, encrypted)
			).rejects.toThrow('only P-256 keys supported');

			const decryptSrc = createReadableStream(Buffer.alloc(0));
			const decrypted = new CollectorStream();

			await expect(
				decryptFIPSKEMDEMStream(keyPair384.privateKey, decryptSrc, decrypted)
			).rejects.toThrow('only P-256 keys supported');
		});
	});

	describe('TestConcurrentOperations', () => {
		test('should handle concurrent encrypt/decrypt operations', async () => {
			const keyPair = generateP256KeyPair();
			const numGoroutines = 10;
			const dataSize = 10000;

			const promises: Promise<void>[] = [];

			for (let i = 0; i < numGoroutines; i++) {
				const promise = (async (id: number) => {
					const data = Buffer.alloc(Math.floor(dataSize / 10))
						.fill(`data${id}`)
						.subarray(0, Math.floor(dataSize / 10));

					const src = createReadableStream(data);
					const encrypted = new CollectorStream();
					await encryptFIPSKEMDEMStream(keyPair.publicKey, src, encrypted);

					const encryptedData = encrypted.getData();
					const decryptSrc = createReadableStream(encryptedData);
					const decrypted = new CollectorStream();
					await decryptFIPSKEMDEMStream(keyPair.privateKey, decryptSrc, decrypted);

					const decryptedData = decrypted.getData();
					if (!decryptedData.equals(data)) {
						throw new Error(`goroutine ${id} data mismatch`);
					}
				})(i);

				promises.push(promise);
			}

			await Promise.all(promises);
		});
	});

	describe('TestDifferentKeyPairs', () => {
		test('should work with correct key and fail with wrong key', async () => {
			const keyPair1 = generateP256KeyPair();
			const keyPair2 = generateP256KeyPair();
			const data = Buffer.from('test data');

			const src = createReadableStream(data);
			const encrypted = new CollectorStream();
			const written = await encryptFIPSKEMDEMStream(keyPair1.publicKey, src, encrypted);

			expect(written).toBe(data.length);

			const encryptedData = encrypted.getData();
			const decryptSrc1 = createReadableStream(encryptedData);
			const decrypted1 = new CollectorStream();
			const read = await decryptFIPSKEMDEMStream(keyPair1.privateKey, decryptSrc1, decrypted1);

			expect(read).toBe(data.length);
			expect(decrypted1.getData().equals(data)).toBe(true);

			const decryptSrc2 = createReadableStream(encryptedData);
			const decrypted2 = new CollectorStream();

			await expect(
				decryptFIPSKEMDEMStream(keyPair2.privateKey, decryptSrc2, decrypted2)
			).rejects.toThrow();

			expect(decrypted2.getData().length).toBe(0);
		});
	});

	describe('TestPartialCorruption', () => {
		test('should handle corrupted data gracefully', async () => {
			const keyPair = generateP256KeyPair();
			const testData = Buffer.from('This is test data for corruption testing');

			const src = createReadableStream(testData);
			const encrypted = new CollectorStream();
			await encryptFIPSKEMDEMStream(keyPair.publicKey, src, encrypted);

			const validEncrypted = encrypted.getData();

			const corruptPositions = [
				0, // Header start
				1, // Header middle
				Math.floor(validEncrypted.length / 4), // Early data
				Math.floor(validEncrypted.length / 2), // Middle data
				Math.floor((3 * validEncrypted.length) / 4), // Late data
				validEncrypted.length - 1, // End data
			];

			for (const pos of corruptPositions) {
				if (pos >= validEncrypted.length) {
					continue;
				}

				const corrupted = Buffer.from(validEncrypted);
				corrupted[pos] ^= 0x01; // Flip one bit

				const decryptSrc = createReadableStream(corrupted);
				const decrypted = new CollectorStream();

				await expect(
					decryptFIPSKEMDEMStream(keyPair.privateKey, decryptSrc, decrypted)
				).rejects.toThrow();
			}
		});
	});

	describe('TestLargeData', () => {
		test('should handle multi-megabyte data', async () => {
			const keyPair = generateP256KeyPair();
			const data = Buffer.alloc(1024 * 1024).fill('X');

			const src = createReadableStream(data);
			const encrypted = new CollectorStream();
			const written = await encryptFIPSKEMDEMStream(keyPair.publicKey, src, encrypted);

			expect(written).toBe(data.length);

			const encryptedData = encrypted.getData();
			const decryptSrc = createReadableStream(encryptedData);
			const decrypted = new CollectorStream();
			const read = await decryptFIPSKEMDEMStream(keyPair.privateKey, decryptSrc, decrypted);

			expect(read).toBe(data.length);

			const decryptedData = decrypted.getData();
			expect(decryptedData.equals(data)).toBe(true);
		});
	});

	describe('TestChunkTooLarge', () => {
		test('should reject chunks that are too large', async () => {
			const keyPair = generateP256KeyPair();
			const data = Buffer.from('test data');

			const src = createReadableStream(data);
			const encrypted = new CollectorStream();
			await encryptFIPSKEMDEMStream(keyPair.publicKey, src, encrypted);

			const validEncrypted = encrypted.getData();
			const headerSize = 2 + validEncrypted.readUInt16BE(0) + 12;
			const chunkSizeOffset = headerSize;

			const corrupted = Buffer.from(validEncrypted);
			const FRAME = 65519;
			const GCM_TAG = 16;
			corrupted.writeUInt16BE(FRAME + GCM_TAG, chunkSizeOffset);

			const decryptSrc = createReadableStream(corrupted);
			const decrypted = new CollectorStream();

			await expect(
				decryptFIPSKEMDEMStream(keyPair.privateKey, decryptSrc, decrypted)
			).rejects.toThrow();
		});
	});
});
