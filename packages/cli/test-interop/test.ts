import { generateKeyPairSync, createPrivateKey } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { encryptFIPSKEMDEMStream, decryptFIPSKEMDEMStream } from '../src/crypto/box';

interface GoKeyPair {
	publicPEM: string;
	privatePEM: string;
}

async function runGoCommand(cmd: string, args: string[], input?: Buffer): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const proc = spawn('./go-crypto-tool', [cmd, ...args], {
			cwd: __dirname,
		});

		const chunks: Buffer[] = [];
		const errors: Buffer[] = [];

		proc.stdout.on('data', (chunk) => chunks.push(chunk));
		proc.stderr.on('data', (chunk) => errors.push(chunk));

		proc.on('error', (err) => reject(err));
		proc.on('close', (code) => {
			if (code !== 0) {
				const stderr = Buffer.concat(errors).toString();
				reject(new Error(`Go command failed with code ${code}: ${stderr}`));
			} else {
				resolve(Buffer.concat(chunks));
			}
		});

		if (input) {
			proc.stdin.write(input);
			proc.stdin.end();
		} else {
			proc.stdin.end();
		}
	});
}

async function testTSEncryptGoDecrypt() {
	console.log('\n🔐 Test: TypeScript Encrypt -> Go Decrypt');

	// Generate keys using Node.js
	const { publicKey, privateKey } = generateKeyPairSync('ec', {
		namedCurve: 'prime256v1',
	});

	const plaintext = Buffer.from('Hello from TypeScript! 🚀'.repeat(10000));

	// Encrypt using TypeScript
	const encrypted = Buffer.alloc(plaintext.length * 2);
	let encryptOffset = 0;

	const src = Readable.from([plaintext]);
	const dst = new Writable({
		write(chunk, _encoding, callback) {
			chunk.copy(encrypted, encryptOffset);
			encryptOffset += chunk.length;
			callback();
		},
	});

	await encryptFIPSKEMDEMStream(publicKey, src, dst);
	const ciphertext = encrypted.subarray(0, encryptOffset);

	console.log(`  ✓ TS encrypted ${plaintext.length} bytes -> ${ciphertext.length} bytes`);

	// Decrypt using Go
	const privPEM = privateKey.export({ type: 'sec1', format: 'pem' }) as string;
	const privBase64 = Buffer.from(privPEM).toString('base64');

	const decrypted = await runGoCommand('decrypt', [privBase64], ciphertext);

	if (Buffer.compare(plaintext, decrypted) === 0) {
		console.log('  ✅ SUCCESS: Go correctly decrypted TS ciphertext');
	} else {
		console.log('  ❌ FAILURE: Decrypted data does not match');
		console.log(`    Expected: ${plaintext.length} bytes`);
		console.log(`    Got: ${decrypted.length} bytes`);
		process.exit(1);
	}
}

async function testGoEncryptTSDecrypt() {
	console.log('\n🔐 Test: Go Encrypt -> TypeScript Decrypt');

	// Generate keys using Go
	const keyJSON = await runGoCommand('keygen', []);
	const keys: GoKeyPair = JSON.parse(keyJSON.toString());
	const privateKey = createPrivateKey(keys.privatePEM);

	const plaintext = Buffer.from('Hello from Go! 🐹'.repeat(10000));

	// Encrypt using Go
	const pubBase64 = Buffer.from(keys.publicPEM).toString('base64');
	const ciphertext = await runGoCommand('encrypt', [pubBase64], plaintext);

	console.log(`  ✓ Go encrypted ${plaintext.length} bytes -> ${ciphertext.length} bytes`);

	// Decrypt using TypeScript
	const decrypted = Buffer.alloc(ciphertext.length);
	let decryptOffset = 0;

	const src = Readable.from([ciphertext]);
	const dst = new Writable({
		write(chunk, _encoding, callback) {
			chunk.copy(decrypted, decryptOffset);
			decryptOffset += chunk.length;
			callback();
		},
	});

	await decryptFIPSKEMDEMStream(privateKey, src, dst);
	const result = decrypted.subarray(0, decryptOffset);

	if (Buffer.compare(plaintext, result) === 0) {
		console.log('  ✅ SUCCESS: TS correctly decrypted Go ciphertext');
	} else {
		console.log('  ❌ FAILURE: Decrypted data does not match');
		console.log(`    Expected: ${plaintext.length} bytes`);
		console.log(`    Got: ${result.length} bytes`);
		process.exit(1);
	}
}

async function main() {
	console.log('════════════════════════════════════════════════════════');
	console.log('   Go-Common ↔ TypeScript Crypto Interoperability Test   ');
	console.log('════════════════════════════════════════════════════════');

	try {
		await testTSEncryptGoDecrypt();
		await testGoEncryptTSDecrypt();

		console.log('\n✨ All interoperability tests passed! ✨\n');
	} catch (err) {
		console.error('\n💥 Test failed:', err);
		process.exit(1);
	}
}

main();
