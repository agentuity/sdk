import { createRouter } from '@agentuity/runtime';
import type { Context } from 'hono';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import { buildAuthorizeUrl, exchangeToken, fetchUserInfo, logout } from '@agentuity/core/oauth';
import type {} from '@agentuity/react';

const api = createRouter();

// Helper to get the base URL from a request
function getBaseUrl(c: Context): string {
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

		// Store tokens for logout
		setCookie(
			c,
			'oauth_tokens',
			encodeURIComponent(
				JSON.stringify({
					access_token: token.access_token,
					refresh_token: token.refresh_token,
				})
			),
			{
				path: '/',
				httpOnly: true,
				secure: new URL(c.req.url).protocol === 'https:',
				sameSite: 'Lax',
				maxAge: 60 * 60 * 24,
			}
		);

		setCookie(c, 'oauth_session', encodeURIComponent(JSON.stringify(user)), {
			path: '/',
			httpOnly: true,
			// secure: true in production, false for local development over HTTP
			secure: new URL(c.req.url).protocol === 'https:',
			sameSite: 'Lax',
			maxAge: 60 * 60 * 24,
		});

		return c.redirect('/');
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return c.json({ error: 'OAuth flow failed', details: message }, 500);
	}
});

// Logout - revoke token and clear session
api.get('/oauth/logout', async (c) => {
	const tokensCookie = getCookie(c, 'oauth_tokens');
	if (tokensCookie) {
		try {
			const tokens = JSON.parse(decodeURIComponent(tokensCookie));
			// Revoke the refresh token (or access token if no refresh token)
			const tokenToRevoke = tokens.refresh_token ?? tokens.access_token;
			if (tokenToRevoke) {
				await logout(tokenToRevoke);
			}
		} catch {
			// Best effort — continue with cookie cleanup even if revocation fails
		}
	}
	deleteCookie(c, 'oauth_tokens', { path: '/' });
	deleteCookie(c, 'oauth_session', { path: '/' });
	return c.redirect('/');
});

export default api;
