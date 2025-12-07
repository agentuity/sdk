import { z } from 'zod';
import { APIResponseSchema } from '@agentuity/server';
import type { APIClient } from '../../../api';
import { createHash } from 'crypto';
import { StructuredError } from '@agentuity/core';

// Zod schemas for API validation
const SSHKeySchema = z.object({
	fingerprint: z.string(),
	keyType: z.string(),
	comment: z.string(),
	publicKey: z.string(),
});

const AddSSHKeyResponseSchema = z.object({
	fingerprint: z.string(),
	added: z.boolean(),
});

const RemoveSSHKeyResponseSchema = z.object({
	removed: z.boolean(),
});

// Exported result types
export interface SSHKey {
	fingerprint: string;
	keyType: string;
	comment: string;
	publicKey: string;
}

export interface AddSSHKeyResult {
	fingerprint: string;
	added: boolean;
}

const InvalidSSHConfigurationError = StructuredError(
	'InvalidSSHConfigurationError',
	'Invalid SSH public key format'
);

export function computeSSHKeyFingerprint(publicKey: string): string {
	// Parse the key (format: "ssh-ed25519 AAAAC3... [comment]")
	const parts = publicKey.trim().split(/\s+/);
	if (parts.length < 2) {
		throw new InvalidSSHConfigurationError();
	}
	const keyData = parts[1]; // Base64-encoded key data
	const buffer = Buffer.from(keyData, 'base64');
	const fingerprint = createHash('sha256').update(buffer).digest('base64');
	return `SHA256:${fingerprint.replace(/=+$/, '')}`;
}

const AddSSHKeyError = StructuredError('AddSSHKeyError');
const AddSSHKeyUnexpectedError = StructuredError(
	'AddSSHKeyUnexpectedError',
	'An unexpected error was received from the server.'
);

export async function addSSHKey(apiClient: APIClient, publicKey: string): Promise<AddSSHKeyResult> {
	const resp = await apiClient.post(
		'/cli/auth/ssh-keys',
		{ publicKey },
		APIResponseSchema(AddSSHKeyResponseSchema)
	);

	if (!resp.success) {
		throw new AddSSHKeyError({ message: resp.message });
	}

	if (!resp.data) {
		throw new AddSSHKeyUnexpectedError();
	}

	return resp.data;
}

const ListSSHKeysError = StructuredError('ListSSHKeysError');

export async function listSSHKeys(apiClient: APIClient): Promise<SSHKey[]> {
	const resp = await apiClient.get('/cli/auth/ssh-keys', APIResponseSchema(z.array(SSHKeySchema)));

	if (!resp.success) {
		throw new ListSSHKeysError({ message: resp.message });
	}

	return resp.data ?? [];
}

const RemoveSSHKeysError = StructuredError('RemoveSSHKeysError');

export async function removeSSHKey(apiClient: APIClient, fingerprint: string): Promise<boolean> {
	// NOTE: Using .request() here because DELETE with body is required by the API
	const resp = await apiClient.request(
		'DELETE',
		'/cli/auth/ssh-keys',
		APIResponseSchema(RemoveSSHKeyResponseSchema),
		{ fingerprint }
	);

	if (!resp.success) {
		throw new RemoveSSHKeysError({ message: resp.message });
	}

	return resp.data?.removed ?? false;
}
