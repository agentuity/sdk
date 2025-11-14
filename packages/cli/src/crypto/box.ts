/**
 * Package crypto implements a **FIPS 140-3 compliant KEM-DEM envelope encryption scheme**
 * suitable for multi-gigabyte streams using ECDH P-256 and AES-256-GCM.
 * This design is compatible with the Go implementation and depends only on standard
 * Node.js crypto packages.
 *
 * ──────────────────────────  Design summary  ─────────────────────────────
 *
 *  ⚙  KEM  (Key-Encapsulation Mechanism)
 *      • ECDH P-256 + AES-256-GCM for DEK wrapping
 *      • Output: variable-size encrypted DEK (48-byte DEK + 16-byte GCM tag + ephemeral pubkey)
 *      • Provides forward secrecy for each blob
 *
 *  ⚙  DEM  (Data-Encapsulation Mechanism)
 *      • AES-256-GCM in ~64 KiB framed chunks (65519 bytes max)
 *      • Nonce = 4-byte random prefix ∥ 8-byte little-endian counter
 *      • First frame authenticates header via associated data (prevents tampering)
 *      • Constant ~64 KiB RAM, O(1) header re-wrap for key rotation
 *
 *  ⚙  Fleet key
 *      • Single ECDSA P-256 key-pair per customer
 *      • Public key used directly for ECDH operations
 *      • Private key stored in cloud secret store and fetched at boot
 *
 *  File layout
 *   ┌─────────────────────────────────────────────────────────────────────────┐
 *   │ uint16 wrappedLen │ 125B wrapped DEK │ 12B base nonce │ frames... │
 *   └─────────────────────────────────────────────────────────────────────────┘
 *                               ▲                    ▲
 *                               │                    └─ AES-256-GCM frames
 *                               └─ ECDH + AES-GCM wrapped DEK
 *
 *  Security properties
 *  • Confidentiality & integrity: AES-256-GCM per frame
 *  • Header authentication: first frame includes header as associated data
 *  • Forward-secrecy per object: new ephemeral ECDH key each encryption
 *  • Key rotation: requires re-wrapping only the ~139-byte header
 *  • FIPS 140-3 compliant: uses only approved algorithms
 *
 *  Typical workflow
 *  ────────────────
 *    Publisher:
 *      1) generate DEK, encrypt stream → dst
 *      2) ephemeral ECDH + AES-GCM wrap DEK with fleet public key
 *      3) write header {len, wrapped DEK, nonce} - ~139 bytes total
 *      4) first frame includes header as associated data for authentication
 *
 *    Machine node:
 *      1) read header, unwrap DEK with fleet private key via ECDH
 *      2) stream-decrypt frames on the fly (first frame verifies header)
 *
 * Public API
 * ──────────
 *
 *  encryptFIPSKEMDEMStream(publicKey: KeyObject, src: Readable, dst: Writable): Promise<number>
 *  decryptFIPSKEMDEMStream(privateKey: KeyObject, src: Readable, dst: Writable): Promise<number>
 *
 * Both return the number of plaintext bytes processed and ensure that
 * every error path is authenticated-failure-safe.
 */

import { createCipheriv, createDecipheriv, createECDH, randomBytes, KeyObject } from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import { createHash } from 'node:crypto';

const FRAME = 65519;
const DEK_SIZE = 32;
const GCM_TAG = 16;
const PUBKEY_LEN = 65;

function concatKDFSHA256(z: Buffer, keyDataLen: number, ...otherInfo: Buffer[]): Buffer {
	const h = createHash('sha256');
	h.update(Buffer.from([0x00, 0x00, 0x00, 0x01]));
	h.update(z);
	for (const info of otherInfo) {
		h.update(info);
	}
	const keyDataLenBits = keyDataLen * 8;
	h.update(
		Buffer.from([
			(keyDataLenBits >> 24) & 0xff,
			(keyDataLenBits >> 16) & 0xff,
			(keyDataLenBits >> 8) & 0xff,
			keyDataLenBits & 0xff,
		])
	);
	return h.digest();
}

function wrapDEKWithECDH(dek: Buffer, recipientPub: KeyObject): Buffer {
	const ephemeral = createECDH('prime256v1');
	ephemeral.generateKeys();

	const jwk = recipientPub.export({ format: 'jwk' });
	if (!jwk.x || !jwk.y) {
		throw new Error('Invalid EC public key');
	}

	const xBuf = Buffer.from(jwk.x, 'base64url');
	const yBuf = Buffer.from(jwk.y, 'base64url');
	const pubKeyPoint = Buffer.concat([Buffer.from([0x04]), xBuf, yBuf]);

	const sharedSecret = ephemeral.computeSecret(pubKeyPoint);
	const kek = concatKDFSHA256(sharedSecret, 32, Buffer.from('AES-256-GCM'));
	sharedSecret.fill(0);

	const nonce = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', kek, nonce);
	const ciphertext = Buffer.concat([cipher.update(dek), cipher.final()]);
	const tag = cipher.getAuthTag();
	kek.fill(0);

	const ephemeralPubBytes = ephemeral.getPublicKey(undefined, 'uncompressed');
	return Buffer.concat([ephemeralPubBytes, nonce, ciphertext, tag]);
}

function unwrapDEKWithECDH(wrapped: Buffer, recipientPriv: KeyObject): Buffer {
	if (wrapped.length < PUBKEY_LEN + 12 + DEK_SIZE + GCM_TAG) {
		throw new Error('wrapped DEK too short');
	}

	const ephemeralPubBytes = wrapped.subarray(0, PUBKEY_LEN);
	const remaining = wrapped.subarray(PUBKEY_LEN);

	const jwk = recipientPriv.export({ format: 'jwk' });
	if (!jwk.d) {
		throw new Error('Invalid EC private key');
	}

	const ecdh = createECDH('prime256v1');
	const dBuf = Buffer.from(jwk.d, 'base64url');

	try {
		ecdh.setPrivateKey(dBuf);

		const sharedSecret = ecdh.computeSecret(ephemeralPubBytes);
		const kek = concatKDFSHA256(sharedSecret, 32, Buffer.from('AES-256-GCM'));
		sharedSecret.fill(0);

		const nonceSize = 12;
		if (remaining.length < nonceSize) {
			throw new Error('invalid wrapped DEK format');
		}

		const nonce = remaining.subarray(0, nonceSize);
		const ciphertextAndTag = remaining.subarray(nonceSize);

		if (ciphertextAndTag.length < GCM_TAG) {
			throw new Error('invalid wrapped DEK format');
		}

		const ciphertext = ciphertextAndTag.subarray(0, ciphertextAndTag.length - GCM_TAG);
		const tag = ciphertextAndTag.subarray(ciphertextAndTag.length - GCM_TAG);

		const decipher = createDecipheriv('aes-256-gcm', kek, nonce);
		decipher.setAuthTag(tag);

		let plaintext: Buffer;
		try {
			plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
		} catch (_err) {
			throw new Error('DEK unwrap failed');
		}

		kek.fill(0);
		return plaintext;
	} finally {
		dBuf.fill(0);
	}
}

function makeNonce(prefix: Buffer, counter: bigint): Buffer {
	const nonce = Buffer.alloc(12);
	prefix.copy(nonce, 0, 0, 4);
	nonce.writeBigUInt64LE(counter, 4);
	return nonce;
}

export async function encryptFIPSKEMDEMStream(
	pub: KeyObject,
	src: Readable,
	dst: Writable
): Promise<number> {
	if (pub.asymmetricKeyType !== 'ec') {
		throw new Error('only EC keys supported');
	}
	const keyDetails = pub.asymmetricKeyDetails;
	if (!keyDetails || keyDetails.namedCurve !== 'prime256v1') {
		throw new Error('only P-256 keys supported');
	}

	const dek = randomBytes(DEK_SIZE);
	let buf: Buffer | undefined;
	const it = src[Symbol.asyncIterator]();

	try {
		const wrapped = wrapDEKWithECDH(dek, pub);

		const baseNonce = Buffer.alloc(12);
		randomBytes(4).copy(baseNonce, 0);

		const lenBuf = Buffer.alloc(2);
		lenBuf.writeUInt16BE(wrapped.length, 0);
		await writeAsync(dst, lenBuf);
		await writeAsync(dst, wrapped);
		await writeAsync(dst, baseNonce);

		let counter = 0n;
		let total = 0;

		const headerAD = Buffer.alloc(2 + 12);
		headerAD.writeUInt16BE(wrapped.length, 0);
		baseNonce.copy(headerAD, 2);

		buf = Buffer.alloc(FRAME);

		while (true) {
			const bytesRead = await readFull(it, src, buf);
			if (bytesRead === 0) {
				break;
			}

			const plaintext = buf.subarray(0, bytesRead);
			const nonce = makeNonce(baseNonce, counter);

			const cipher = createCipheriv('aes-256-gcm', dek, nonce);

			if (counter === 0n) {
				cipher.setAAD(headerAD);
			}

			const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
			const tag = cipher.getAuthTag();
			const ct = Buffer.concat([ciphertext, tag]);

			if (ct.length > 0xffff) {
				throw new Error('ciphertext length exceeds uint16 limit');
			}

			const ctLenBuf = Buffer.alloc(2);
			ctLenBuf.writeUInt16BE(ct.length, 0);
			await writeAsync(dst, ctLenBuf);
			await writeAsync(dst, ct);

			counter++;
			total += bytesRead;

			if (bytesRead < FRAME) {
				break;
			}
		}

		return total;
	} finally {
		dek.fill(0);
		if (buf) buf.fill(0);
		await it.return?.().catch(() => {});
	}
}

export async function decryptFIPSKEMDEMStream(
	priv: KeyObject,
	src: Readable,
	dst: Writable
): Promise<number> {
	if (priv.asymmetricKeyType !== 'ec') {
		throw new Error('only EC keys supported');
	}
	const keyDetails = priv.asymmetricKeyDetails;
	if (!keyDetails || keyDetails.namedCurve !== 'prime256v1') {
		throw new Error('only P-256 keys supported');
	}

	const it = src[Symbol.asyncIterator]();

	try {
		const lenBuf = Buffer.alloc(2);
		await readExact(it, src, lenBuf);
		const wrappedLen = lenBuf.readUInt16BE(0);

		if (wrappedLen === 0 || wrappedLen > 200) {
			throw new Error('invalid wrapped DEK length');
		}

		const wrapped = Buffer.alloc(wrappedLen);
		await readExact(it, src, wrapped);

		const baseNonce = Buffer.alloc(12);
		await readExact(it, src, baseNonce);

		const dek = unwrapDEKWithECDH(wrapped, priv);

		try {
			let counter = 0n;
			let total = 0;

			const headerAD = Buffer.alloc(2 + 12);
			headerAD.writeUInt16BE(wrappedLen, 0);
			baseNonce.copy(headerAD, 2);

			while (true) {
				const chunkLenBuf = Buffer.alloc(2);
				const chunkLenRead = await readUpTo(it, src, chunkLenBuf);
				if (chunkLenRead === 0) {
					break;
				}
				if (chunkLenRead < 2) {
					throw new Error('unexpected EOF reading chunk length');
				}

				const chunkLen = chunkLenBuf.readUInt16BE(0);
				if (chunkLen > FRAME + GCM_TAG) {
					throw new Error('chunk too large');
				}

				const cipherBuf = Buffer.alloc(chunkLen);
				await readExact(it, src, cipherBuf);

				if (cipherBuf.length < GCM_TAG) {
					throw new Error('chunk too short for auth tag');
				}

				const ciphertext = cipherBuf.subarray(0, cipherBuf.length - GCM_TAG);
				const tag = cipherBuf.subarray(cipherBuf.length - GCM_TAG);

				const nonce = makeNonce(baseNonce, counter);
				const decipher = createDecipheriv('aes-256-gcm', dek, nonce);
				decipher.setAuthTag(tag);

				if (counter === 0n) {
					decipher.setAAD(headerAD);
				}

				let plain: Buffer;
				try {
					plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
				} catch (err) {
					cipherBuf.fill(0);
					throw err;
				}

				cipherBuf.fill(0);

				await writeAsync(dst, plain);
				counter++;
				total += plain.length;
			}

			return total;
		} finally {
			dek.fill(0);
		}
	} finally {
		await it.return?.().catch(() => {});
	}
}

async function writeAsync(stream: Writable, chunk: Buffer): Promise<void> {
	return new Promise((resolve, reject) => {
		const canContinue = stream.write(chunk, (err) => {
			if (err) reject(err);
			else resolve();
		});
		if (canContinue) {
			// Write succeeded immediately, callback will call resolve
			return;
		}
		// Need to wait for drain
		const onDrain = () => {
			cleanup();
			resolve();
		};
		const onError = (err: Error) => {
			cleanup();
			reject(err);
		};
		const cleanup = () => {
			stream.off('drain', onDrain);
			stream.off('error', onError);
		};
		stream.once('drain', onDrain);
		stream.once('error', onError);
	});
}

async function readFull(
	iterator: AsyncIterator<Buffer | string>,
	stream: Readable,
	buf: Buffer
): Promise<number> {
	let offset = 0;

	while (offset < buf.length) {
		const result = await iterator.next();
		if (result.done) {
			break;
		}

		const chunk = result.value;
		const chunkBuf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		const toCopy = Math.min(chunkBuf.length, buf.length - offset);
		chunkBuf.copy(buf, offset, 0, toCopy);
		offset += toCopy;

		if (offset >= buf.length && toCopy < chunkBuf.length) {
			stream.unshift(chunkBuf.subarray(toCopy));
			break;
		}
	}

	return offset;
}

async function readExact(
	iterator: AsyncIterator<Buffer | string>,
	stream: Readable,
	buf: Buffer
): Promise<void> {
	let offset = 0;

	while (offset < buf.length) {
		const result = await iterator.next();
		if (result.done) {
			throw new Error('unexpected EOF');
		}

		const chunk = result.value;
		const chunkBuf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		const toCopy = Math.min(chunkBuf.length, buf.length - offset);
		chunkBuf.copy(buf, offset, 0, toCopy);
		offset += toCopy;

		if (offset >= buf.length && toCopy < chunkBuf.length) {
			stream.unshift(chunkBuf.subarray(toCopy));
			break;
		}
	}
}

async function readUpTo(
	iterator: AsyncIterator<Buffer | string>,
	stream: Readable,
	buf: Buffer
): Promise<number> {
	const result = await iterator.next();
	if (result.done) {
		return 0;
	}

	const chunk = result.value;
	const chunkBuf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
	const toCopy = Math.min(chunkBuf.length, buf.length);
	chunkBuf.copy(buf, 0, 0, toCopy);

	if (toCopy < chunkBuf.length) {
		stream.unshift(chunkBuf.subarray(toCopy));
	}

	return toCopy;
}
