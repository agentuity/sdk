import { createGenesisAuth, type GenesisAuthConfig, type GenesisIdentity } from '../auth/index.ts';
import { isAnonymousAuthResult } from '../auth/types.ts';

export type TanStackGenesisContext = {
	genesisIdentity?: GenesisIdentity;
};

export type TanStackMiddlewareArgs = {
	request: Request;
	next: (options?: { context?: TanStackGenesisContext }) => Promise<Response>;
	context: TanStackGenesisContext;
};

/**
 * TanStack Start server middleware handler. Wrap with `createMiddleware` from `@tanstack/react-start`:
 *
 * ```ts
 * import { createMiddleware } from '@tanstack/react-start';
 * import { genesisAuthTanStackStart } from '@agentuity/genesis/tanstack-start';
 *
 * export const genesisAuth = createMiddleware().server(genesisAuthTanStackStart({ projectId }));
 * ```
 */
export function genesisAuthTanStackStart(config: GenesisAuthConfig) {
	const auth = createGenesisAuth(config);

	return async ({ request, next, context }: TanStackMiddlewareArgs): Promise<Response> => {
		const result = await auth.authenticate(request);

		if (!result.ok) {
			if (isAnonymousAuthResult(result)) {
				return next({ context });
			}
			return new Response(result.message, { status: result.status });
		}

		return next({
			context: {
				...context,
				genesisIdentity: result.identity,
			},
		});
	};
}
