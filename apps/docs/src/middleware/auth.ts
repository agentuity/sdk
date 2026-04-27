import crypto from 'node:crypto';
import { createMiddleware } from 'hono/factory';
import { getSignedCookie, setSignedCookie } from 'hono/cookie';
import { getSessionSecret } from '@agentuity/runtime';

function isSecureRequest(url: string, forwardedProto: string | undefined): boolean {
	if (forwardedProto) {
		return forwardedProto === 'https';
	}

	try {
		return new URL(url).protocol === 'https:';
	} catch {
		return false;
	}
}

/**
 * Cookie-only authentication middleware
 * Validates the chat_user_id cookie is present
 * Use this for public-facing endpoints that only need user identification
 */
export const cookieAuth = createMiddleware(async (c, next) => {
	const secret = getSessionSecret();
	let userId = await getSignedCookie(c, secret, 'chat_user_id');
	if (userId === false) {
		c.var.logger.warn('Invalid chat_user_id cookie signature');
		userId = undefined;
	}
	if (!userId) {
		userId = `anon_${crypto.randomUUID()}`;
		await setSignedCookie(c, 'chat_user_id', userId, secret, {
			httpOnly: true,
			secure: isSecureRequest(c.req.url, c.req.header('x-forwarded-proto')),
			sameSite: 'Lax',
			path: '/',
			maxAge: 60 * 60 * 24 * 365,
		});
		c.var.logger.info('Issued chat_user_id cookie', { userId });
	}
	c.set('userId', userId);
	await next();
});

/**
 * Bearer token authentication middleware
 * Validates the Authorization header contains the correct bearer token
 * Use this for machine-to-machine API calls (no user context needed)
 */
export const bearerTokenAuth = createMiddleware(async (c, next) => {
	const authHeader = c.req.header('Authorization');
	const expectedToken = process.env.AGENT_BEARER_TOKEN;

	if (!authHeader) {
		c.var.logger.warn('Missing Authorization header');
		return c.json({ error: 'Missing Authorization header' }, 401);
	}

	if (!authHeader.startsWith('Bearer ')) {
		c.var.logger.warn('Invalid Authorization header format');
		return c.json({ error: 'Invalid Authorization header format' }, 401);
	}

	const token = authHeader.slice(7);

	if (!expectedToken) {
		c.var.logger.warn('AGENT_BEARER_TOKEN not configured');
		return c.json({ error: 'Server authentication not configured' }, 500);
	}

	const tokenBuffer = Buffer.from(token);
	const expectedBuffer = Buffer.from(expectedToken);

	try {
		const isValid = crypto.timingSafeEqual(tokenBuffer, expectedBuffer);
		if (!isValid) {
			c.var.logger.warn('Invalid bearer token');
			return c.json({ error: 'Invalid bearer token' }, 401);
		}
	} catch {
		// Length mismatch throws - treat as invalid token
		c.var.logger.warn('Invalid bearer token');
		return c.json({ error: 'Invalid bearer token' }, 401);
	}

	await next();
});
