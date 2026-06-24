import { createGenesisAuth, type GenesisAuthConfig, type GenesisIdentity } from '../auth/index.ts';
import { isAnonymousAuthResult } from '../auth/types.ts';

export type VercelGenesisAuthResult = {
	/** Continue the middleware chain when undefined. */
	response?: Response;
	identity?: GenesisIdentity;
	/** Request with genesis identity headers attached for downstream handlers. */
	request?: Request;
};

/**
 * Vercel / Edge middleware helper. Returns a response to short-circuit, or request/identity to continue.
 *
 * ```ts
 * const auth = genesisAuthVercel({ projectId });
 * export async function middleware(request: Request) {
 *   const result = await auth(request);
 *   if (result.response) return result.response;
 *   return NextResponse.next({ request: result.request ?? request });
 * }
 * ```
 */
export function genesisAuthVercel(config: GenesisAuthConfig) {
	const auth = createGenesisAuth(config);

	return async (request: Request): Promise<VercelGenesisAuthResult> => {
		const result = await auth.authenticate(request);

		if (!result.ok) {
			if (isAnonymousAuthResult(result)) {
				return { request: stripGenesisHeaders(request) };
			}
			return { response: new Response(result.message, { status: result.status }) };
		}

		return {
			identity: result.identity,
			request: attachGenesisIdentityHeaders(request, result.identity),
		};
	};
}

function stripGenesisHeaders(request: Request): Request {
	const headers = new Headers();
	for (const [key, value] of request.headers) {
		if (!key.toLowerCase().startsWith('x-genesis-')) {
			headers.set(key, value);
		}
	}
	return new Request(request, { headers });
}

export function attachGenesisIdentityHeaders(request: Request, identity: GenesisIdentity): Request {
	const headers = new Headers();
	for (const [key, value] of request.headers) {
		if (!key.toLowerCase().startsWith('x-genesis-')) {
			headers.set(key, value);
		}
	}
	headers.set('x-genesis-user-id', identity.userId);
	headers.set('x-genesis-genesis-user-id', identity.genesisUserId);
	if (identity.email) {
		headers.set('x-genesis-user-email', identity.email);
	}
	return new Request(request, { headers });
}
