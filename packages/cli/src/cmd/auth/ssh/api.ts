import { z } from 'zod';
import { APIResponseSchema } from '@agentuity/server';
import type { APIClient } from '../../../api';
import { createHash } from 'crypto';

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

export function computeSSHKeyFingerprint(publicKey: string): string {
	// Parse the key (format: "ssh-ed25519 AAAAC3... [comment]")
	const parts = publicKey.trim().split(/\s+/);
	if (parts.length < 2) {
		throw new Error('Invalid SSH public key format');
	}
	const keyData = parts[1]; // Base64-encoded key data
	const buffer = Buffer.from(keyData, 'base64');
	const fingerprint = createHash('sha256').update(buffer).digest('base64');
	return `SHA256:${fingerprint.replace(/=+$/, '')}`;
}

export async function addSSHKey(
	apiClient: APIClient,
	publicKey: string
): Promise<AddSSHKeyResult> {
	const resp = await apiClient.request(
		'POST',
		'/cli/auth/ssh-keys',
		APIResponseSchema(AddSSHKeyResponseSchema),
		{ publicKey }
	);

	if (!resp.success) {
		throw new Error(resp.message);
	}

	if (!resp.data) {
		throw new Error('No data returned from server');
	}

	return resp.data;
}

export async function listSSHKeys(apiClient: APIClient): Promise<SSHKey[]> {
	const resp = await apiClient.request(
		'GET',
		'/cli/auth/ssh-keys',
		APIResponseSchema(z.array(SSHKeySchema))
	);

	if (!resp.success) {
		throw new Error(resp.message);
	}

	return resp.data ?? [];
}

export async function removeSSHKey(
	apiClient: APIClient,
	fingerprint: string
): Promise<boolean> {
	const resp = await apiClient.request(
		'DELETE',
		'/cli/auth/ssh-keys',
		APIResponseSchema(RemoveSSHKeyResponseSchema),
		{ fingerprint }
	);

	if (!resp.success) {
		throw new Error(resp.message);
	}

	return resp.data?.removed ?? false;
}
