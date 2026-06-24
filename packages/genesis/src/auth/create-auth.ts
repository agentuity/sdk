import { GenesisAuthError } from './errors.ts';
import { fetchIdentitySigningKey, resolveAuthHubUrl } from './signing-key.ts';
import type {
	GenesisAuthConfig,
	GenesisAuthResult,
	GenesisIdentity,
	UpstreamIdentitySigningKey,
} from './types.ts';
import { verifyUpstreamIdentityToken } from './verify.ts';

export function resolveProjectId(configured?: string): string {
	const raw =
		configured?.trim() ||
		(typeof process !== 'undefined'
			? process.env.AGENTUITY_CLOUD_PROJECT_ID?.trim()
			: undefined) ||
		'';
	return raw;
}

export type GenesisAuth = {
	ensureReady: () => Promise<void>;
	authenticate: (request: Request) => Promise<GenesisAuthResult>;
	getSigningKey: () => UpstreamIdentitySigningKey | null;
};

export function createGenesisAuth(config: GenesisAuthConfig = {}): GenesisAuth {
	const projectId = resolveProjectId(config.projectId);
	if (!projectId) {
		throw new Error('projectId is required (set projectId or AGENTUITY_CLOUD_PROJECT_ID)');
	}

	const authHubUrl = resolveAuthHubUrl(config.authHubUrl);
	const fetchKey = config.fetchSigningKey ?? ((hub) => fetchIdentitySigningKey(hub));

	let signingKey: UpstreamIdentitySigningKey | null = null;
	let readyPromise: Promise<void> | null = null;

	async function loadSigningKey(): Promise<void> {
		signingKey = await fetchKey(authHubUrl);
	}

	async function ensureReady(): Promise<void> {
		if (signingKey) {
			return;
		}
		if (!readyPromise) {
			readyPromise = loadSigningKey().catch((err) => {
				readyPromise = null;
				throw err;
			});
		}
		await readyPromise;
	}

	async function authenticate(request: Request): Promise<GenesisAuthResult> {
		await ensureReady();
		if (!signingKey) {
			return { ok: false, status: 500, message: 'signing key not loaded' };
		}

		const headerName = signingKey.token_header || 'X-Genesis-Identity-Token';
		const token =
			request.headers.get(headerName) ?? request.headers.get(headerName.toLowerCase());
		if (!token?.trim()) {
			if (config.optional) {
				return { ok: false, status: 401, message: 'missing identity token' };
			}
			return { ok: false, status: 401, message: 'missing identity token' };
		}

		try {
			const identity = await verifyUpstreamIdentityToken(signingKey, token.trim(), projectId);
			return { ok: true, identity };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'invalid identity token';
			if (config.optional) {
				return { ok: false, status: 401, message };
			}
			return { ok: false, status: 401, message };
		}
	}

	return {
		ensureReady,
		authenticate,
		getSigningKey: () => signingKey,
	};
}

/** Authenticate or throw `GenesisAuthError`. */
export async function requireGenesisIdentity(
	auth: GenesisAuth,
	request: Request
): Promise<GenesisIdentity> {
	const result = await auth.authenticate(request);
	if (!result.ok) {
		throw new GenesisAuthError(result.message, result.status);
	}
	return result.identity;
}
