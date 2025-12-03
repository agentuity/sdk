/**
 * macOS Keychain integration for secure auth token storage
 * 
 * Stores auth tokens encrypted in the macOS Keychain using a per-device AES-256 key.
 * No user prompts required - fully automatic and secure.
 */

const SERVICE_PREFIX = "com.agentuity.cli";
const KEY_ACCOUNT = "aes-encryption-key";

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
	const find = Bun.spawn(
		['security', 'find-generic-password', '-s', service, '-a', KEY_ACCOUNT, '-w'],
		{ stderr: 'ignore' }
	);

	const stdout = await new Response(find.stdout).text();

	if (stdout.length > 0) {
		const b64 = stdout.trim();
		return Uint8Array.from(Buffer.from(b64, 'base64'));
	}

	// Create a new 32-byte (256-bit) AES key
	const key = crypto.getRandomValues(new Uint8Array(32));
	const b64 = Buffer.from(key).toString('base64');

	// Store in macOS Keychain (no user prompts with -U flag)
	const add = Bun.spawn([
		'security',
		'add-generic-password',
		'-s',
		service,
		'-a',
		KEY_ACCOUNT,
		'-w',
		b64,
		'-U', // Update without user confirmation
	]);
	await add.exited;

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

/**
 * Store auth data in macOS Keychain
 */
export async function saveAuthToKeychain(
	profileName: string,
	authData: { api_key: string; user_id: string; expires: number }
): Promise<void> {
	const service = `${SERVICE_PREFIX}.${profileName}`;
	const account = 'auth-token';

	// Get or create encryption key
	const key = await ensureEncryptionKey(service);

	// Encrypt the auth data
	const json = JSON.stringify(authData);
	const encrypted = await encrypt(json, key);
	const b64 = Buffer.from(encrypted).toString('base64');

	// Store encrypted auth in keychain
	// First try to delete if exists, then add
	const del = Bun.spawn(
		['security', 'delete-generic-password', '-s', service, '-a', account],
		{ stderr: 'ignore' }
	);
	await del.exited;

	const add = Bun.spawn([
		'security',
		'add-generic-password',
		'-s',
		service,
		'-a',
		account,
		'-w',
		b64,
		'-U',
	]);
	await add.exited;
}

/**
 * Retrieve auth data from macOS Keychain
 */
export async function getAuthFromKeychain(
	profileName: string
): Promise<{ api_key: string; user_id: string; expires: number } | null> {
	const service = `${SERVICE_PREFIX}.${profileName}`;
	const account = 'auth-token';

	try {
		// Get the encrypted auth data
		const find = Bun.spawn(
			['security', 'find-generic-password', '-s', service, '-a', account, '-w'],
			{ stderr: 'ignore' }
		);

		const stdout = await new Response(find.stdout).text();
		if (stdout.length === 0) {
			return null;
		}

		const b64 = stdout.trim();
		const encrypted = Uint8Array.from(Buffer.from(b64, 'base64'));

		// Get the encryption key
		const key = await ensureEncryptionKey(service);

		// Decrypt the auth data
		const json = await decrypt(encrypted, key);
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
	const account = 'auth-token';

	const del = Bun.spawn(
		['security', 'delete-generic-password', '-s', service, '-a', account],
		{ stderr: 'ignore' }
	);
	await del.exited;
}
