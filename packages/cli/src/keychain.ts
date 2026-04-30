/**
 * macOS Keychain integration for secure auth token storage
 *
 * Stores auth tokens encrypted in the macOS Keychain using a per-device AES-256 key.
 * No user prompts required - fully automatic and secure.
 */

import { Buffer } from 'node:buffer';
import { run } from './node-compat/proc.ts';

const SERVICE_PREFIX = 'com.agentuity.cli';
const KEY_ACCOUNT = 'aes-encryption-key';
const AUTH_ACCOUNT = 'auth-token';
const CODER_API_KEY_ACCOUNT = 'coder-hub-api-key';

/**
 * Check if we're running on macOS
 */
export function isMacOS(): boolean {
	return process.platform === 'darwin';
}

/**
 * Get or create an AES encryption key stored in the macOS Keychain
 */
async function ensureEncryptionKey(service: string): Promise<Uint8Array> {
	// Try to read existing key
	const find = await run({
		cmd: ['security', 'find-generic-password', '-s', service, '-a', KEY_ACCOUNT, '-w'],
	});

	if (find.stdout.length > 0) {
		const b64 = find.stdout.trim();
		return Uint8Array.from(Buffer.from(b64, 'base64'));
	}

	// Create a new 32-byte (256-bit) AES key
	const key = crypto.getRandomValues(new Uint8Array(32));
	const b64 = Buffer.from(key).toString('base64');

	// Store in macOS Keychain (no user prompts with -U flag)
	await run({
		cmd: [
			'security',
			'add-generic-password',
			'-s',
			service,
			'-a',
			KEY_ACCOUNT,
			'-w',
			b64,
			'-U', // Update without user confirmation
		],
	});

	return key;
}

/**
 * Encrypt data using AES-256-GCM
 */
async function encrypt(data: string, keyBytes: Uint8Array): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);

	const iv = crypto.getRandomValues(new Uint8Array(12));
	const plaintext = new TextEncoder().encode(data);

	const ciphertext = new Uint8Array(
		await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
	);

	// Combine IV + ciphertext
	const combined = new Uint8Array(iv.length + ciphertext.length);
	combined.set(iv, 0);
	combined.set(ciphertext, iv.length);

	return combined;
}

/**
 * Decrypt data using AES-256-GCM
 */
async function decrypt(combined: Uint8Array, keyBytes: Uint8Array): Promise<string> {
	const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);

	const iv = combined.slice(0, 12);
	const ciphertext = combined.slice(12);

	const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);

	return new TextDecoder().decode(plaintext);
}

async function saveEncryptedValueToKeychain(
	service: string,
	account: string,
	value: string
): Promise<void> {
	const key = await ensureEncryptionKey(service);
	const encrypted = await encrypt(value, key);
	const b64 = Buffer.from(encrypted).toString('base64');

	// Delete the existing entry (if any) before adding the new one. We
	// don't care whether the delete succeeded — we're about to write
	// the new value anyway.
	await run({
		cmd: ['security', 'delete-generic-password', '-s', service, '-a', account],
	});

	await run({
		cmd: ['security', 'add-generic-password', '-s', service, '-a', account, '-w', b64, '-U'],
	});
}

async function getEncryptedValueFromKeychain(
	service: string,
	account: string
): Promise<string | null> {
	const find = await run({
		cmd: ['security', 'find-generic-password', '-s', service, '-a', account, '-w'],
	});

	if (find.stdout.length === 0) {
		return null;
	}

	const encrypted = Uint8Array.from(Buffer.from(find.stdout.trim(), 'base64'));
	const key = await ensureEncryptionKey(service);
	return decrypt(encrypted, key);
}

async function deleteValueFromKeychain(service: string, account: string): Promise<void> {
	await run({
		cmd: ['security', 'delete-generic-password', '-s', service, '-a', account],
	});
}

/**
 * Store auth data in macOS Keychain
 */
export async function saveAuthToKeychain(
	profileName: string,
	authData: { api_key: string; user_id: string; expires: number }
): Promise<void> {
	const service = `${SERVICE_PREFIX}.${profileName}`;
	await saveEncryptedValueToKeychain(service, AUTH_ACCOUNT, JSON.stringify(authData));
}

/**
 * Retrieve auth data from macOS Keychain
 */
export async function getAuthFromKeychain(
	profileName: string
): Promise<{ api_key: string; user_id: string; expires: number } | null> {
	const service = `${SERVICE_PREFIX}.${profileName}`;

	try {
		const json = await getEncryptedValueFromKeychain(service, AUTH_ACCOUNT);
		if (!json) {
			return null;
		}
		return JSON.parse(json);
	} catch {
		return null;
	}
}

/**
 * Delete auth data from macOS Keychain
 */
export async function deleteAuthFromKeychain(profileName: string): Promise<void> {
	const service = `${SERVICE_PREFIX}.${profileName}`;
	await deleteValueFromKeychain(service, AUTH_ACCOUNT);
}

export async function saveCoderApiKeyToKeychain(
	profileName: string,
	apiKey: string
): Promise<void> {
	const service = `${SERVICE_PREFIX}.${profileName}`;
	await saveEncryptedValueToKeychain(service, CODER_API_KEY_ACCOUNT, apiKey);
}

export async function getCoderApiKeyFromKeychain(profileName: string): Promise<string | null> {
	const service = `${SERVICE_PREFIX}.${profileName}`;
	try {
		return await getEncryptedValueFromKeychain(service, CODER_API_KEY_ACCOUNT);
	} catch {
		return null;
	}
}

export async function deleteCoderApiKeyFromKeychain(profileName: string): Promise<void> {
	const service = `${SERVICE_PREFIX}.${profileName}`;
	await deleteValueFromKeychain(service, CODER_API_KEY_ACCOUNT);
}
