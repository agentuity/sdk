import { createMiddleware } from 'hono/factory';
import type { MiddlewareHandler } from 'hono';
import {
	createGenesisAuth,
	GenesisAuthError,
	requireGenesisIdentity,
	type GenesisAuthConfig,
	type GenesisIdentity,
} from '../auth/index.ts';

export type GenesisAuthVariables = {
	genesisIdentity?: GenesisIdentity;
};

export function genesisAuth(
	config: GenesisAuthConfig
): MiddlewareHandler<{ Variables: GenesisAuthVariables }> {
	const auth = createGenesisAuth(config);

	return createMiddleware(async (c, next) => {
		await auth.ensureReady();

		if (config.optional) {
			const result = await auth.authenticate(c.req.raw);
			if (result.ok) {
				c.set('genesisIdentity', result.identity);
			}
			await next();
			return;
		}

		try {
			const identity = await requireGenesisIdentity(auth, c.req.raw);
			c.set('genesisIdentity', identity);
			await next();
		} catch (err) {
			if (err instanceof GenesisAuthError) {
				return c.json({ error: err.message }, err.status === 403 ? 403 : 401);
			}
			return c.json({ error: 'unauthorized' }, 401);
		}
	});
}
