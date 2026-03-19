import { createRouter } from '@agentuity/runtime';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import { buildAuthorizeUrl, exchangeToken, fetchUserInfo } from '@agentuity/core/oauth';
import type {} from '@agentuity/react';

const api = createRouter();

// Helper to get the base URL from a request
function getBaseUrl(c: any): string {
	const url = new URL(c.req.url);
	return `${url.protocol}//${url.host}`;
}

// Check login status
api.get('/oauth/me', async (c) => {
	const session = getCookie(c, 'oauth_session');

	if (session) {
		try {
			const user = JSON.parse(decodeURIComponent(session));
			return c.json({ loggedIn: true, user });
		} catch {
			deleteCookie(c, 'oauth_session');
		}
	}

	const redirectUri = `${getBaseUrl(c)}/api/oauth/login`;
	const loginUrl = buildAuthorizeUrl(redirectUri, { prompt: 'consent' });

	return c.json({ loggedIn: false, loginUrl });
});

// OAuth callback - exchanges code for token and fetches user info
api.get('/oauth/login', async (c) => {
	const code = c.req.query('code');

	if (!code) {
		return c.json({ error: 'No authorization code provided' }, 400);
	}

	const redirectUri = `${getBaseUrl(c)}/api/oauth/login`;

	try {
		const token = await exchangeToken(code, redirectUri);
		const user = await fetchUserInfo(token.access_token);

		setCookie(c, 'oauth_session', encodeURIComponent(JSON.stringify(user)), {
			path: '/',
			httpOnly: true,
			secure: false,
			sameSite: 'Lax',
			maxAge: 60 * 60 * 24,
		});

		return c.redirect('/');
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return c.json({ error: 'OAuth flow failed', details: message }, 500);
	}
});

// Logout - clear session
api.get('/oauth/logout', async (c) => {
	deleteCookie(c, 'oauth_session', { path: '/' });
	return c.redirect('/');
});

export default api;
