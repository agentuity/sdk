# OAuth Demo App

A minimal Agentuity app demonstrating OAuth 2.0 Authorization Code flow with Agentuity's OIDC provider.

## Setup

### 1. Register an OAuth Client

Go to [app.agentuity.com/settings/oauth-apps](https://app.agentuity.com/settings/oauth-apps) and create a new OAuth app with:

- **Redirect URIs:** `http://localhost:3500/api/oauth/login`
- **Logout URIs:** `http://localhost:3500/api/oauth/logout`
- **Scopes:** `openid`, `profile`, `email` (and any others you need)

Save the **Client ID** and **Client Secret**.

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your values:

```sh
cp .env.example .env
```

```env
OAUTH_CLIENT_ID=oidc_your_client_id_here
OAUTH_CLIENT_SECRET=your_client_secret_here
OAUTH_AUTHORIZE_URL=https://auth.agentuity.cloud/authorize
OAUTH_TOKEN_URL=https://auth.agentuity.cloud/oauth/token
OAUTH_USERINFO_URL=https://auth.agentuity.cloud/userinfo
OAUTH_SCOPES=openid profile email
```

> For dev environments, use `auth.agentuity.io` instead of `auth.agentuity.cloud`.

### 3. Run

```sh
bun install
bun run dev
```

Open [http://localhost:3500](http://localhost:3500).

## How It Works

The app has three API routes:

| Route | Purpose |
|-------|---------|
| `GET /api/oauth/me` | Returns user info if logged in, or a login URL if not |
| `GET /api/oauth/login` | OAuth callback — exchanges code for token, fetches user info, sets session cookie |
| `GET /api/oauth/logout` | Clears session cookie and redirects home |

### Flow

1. Browser loads the home page and calls `/api/oauth/me`
2. If no session, the API returns a `loginUrl` pointing to the OIDC authorize endpoint
3. User clicks "Login" and is redirected to Agentuity to authenticate
4. After authentication, the provider redirects back to `/api/oauth/login?code=...`
5. The app exchanges the code for an access token, fetches user info, and stores it in a cookie
6. User is redirected home and sees their profile info

### OIDC Discovery

The canonical endpoint URLs can be found at:

```
https://auth.agentuity.cloud/.well-known/openid-configuration
```
