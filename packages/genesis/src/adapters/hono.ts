import { createMiddleware } from 'hono/factory';
import type { MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import {
	createGenesisAuth,
	isGenesisAuthError,
	requireGenesisIdentity,
	type GenesisAuthConfig,
	type GenesisIdentity,
} from '../auth/index.ts';
import { isAnonymousAuthResult } from '../auth/types.ts';

export type GenesisAuthVariables = {
	genesisIdentity?: GenesisIdentity;
};

export function genesisAuth(
	config: GenesisAuthConfig
): MiddlewareHandler<{ Variables: GenesisAuthVariables }> {
	const auth = createGenesisAuth(config);

	return createMiddleware(async (c, next) => {
		if (config.optional) {
			const result = await auth.authenticate(c.req.raw);
			if (result.ok) {
				c.set('genesisIdentity', result.identity);
			} else if (!isAnonymousAuthResult(result)) {
				return c.json({ error: result.message }, result.status as ContentfulStatusCode);
			}
			await next();
			return;
		}

		try {
			const identity = await requireGenesisIdentity(auth, c.req.raw);
			c.set('genesisIdentity', identity);
			await next();
		} catch (err) {
			if (isGenesisAuthError(err)) {
				return c.json({ error: err.message }, err.status as ContentfulStatusCode);
			}
			return c.json({ error: 'unauthorized' }, 401);
		}
	});
}
