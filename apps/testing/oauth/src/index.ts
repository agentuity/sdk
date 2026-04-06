/**
 * OAuth Demo — Plain Hono App
 *
 * Demonstrates OAuth 2.0 Authorization Code flow using Agentuity's OIDC provider.
 * No createApp(), no agents — just a Hono server with cookie-based sessions.
 */

import { Hono } from 'hono';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import { buildAuthorizeUrl, exchangeToken, fetchUserInfo } from '@agentuity/core/oauth';

const app = new Hono();

/** Get the origin from a request for redirect URIs. */
function getBaseUrl(url: string): string {
	const parsed = new URL(url);
	return `${parsed.protocol}//${parsed.host}`;
}

// ── Routes ───────────────────────────────────────────────────────────────────

app.get('/', (c) => {
	return c.html(`<!DOCTYPE html>
<html><body>
<h1>OAuth Demo</h1>
<p><a href="/auth/me">Check login status</a></p>
<p><a href="/auth/logout">Logout</a></p>
</body></html>`);
});

/** Check login status — returns user info or a login URL. */
app.get('/auth/me', async (c) => {
	const session = getCookie(c, 'oauth_session');

	if (session) {
		try {
			const user = JSON.parse(decodeURIComponent(session));
			return c.json({ loggedIn: true, user });
		} catch {
			deleteCookie(c, 'oauth_session');
		}
	}

	const redirectUri = `${getBaseUrl(c.req.url)}/auth/callback`;
	const loginUrl = buildAuthorizeUrl(redirectUri, { prompt: 'consent' });

	return c.json({ loggedIn: false, loginUrl });
});

/** OAuth callback — exchanges code for token, fetches user info, sets session cookie. */
app.get('/auth/callback', async (c) => {
	const code = c.req.query('code');
	if (!code) {
		return c.json({ error: 'No authorization code provided' }, 400);
	}

	const redirectUri = `${getBaseUrl(c.req.url)}/auth/callback`;

	try {
		const token = await exchangeToken(code, redirectUri);
		const user = await fetchUserInfo(token.access_token);

		setCookie(c, 'oauth_session', encodeURIComponent(JSON.stringify(user)), {
			path: '/',
			httpOnly: true,
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

/** Logout — clear session cookie. */
app.get('/auth/logout', (c) => {
	deleteCookie(c, 'oauth_session', { path: '/' });
	return c.redirect('/');
});

const port = parseInt(process.env.PORT || '3000', 10);

export default {
	port,
	fetch: app.fetch,
};
