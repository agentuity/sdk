# Authentication Commands

The auth command provides authentication and authorization functionality for the Agentuity Platform.

## Commands

### `auth login`

Login to the Agentuity Platform using a browser-based authentication flow, or store API-key credentials for headless environments.

```bash
agentuity auth login
agentuity auth login --api-key $AGENTUITY_API_KEY --user-id $AGENTUITY_USER_ID
# or
agentuity login
```

**Headless / CI auth**

- Set `AGENTUITY_API_KEY` (and optionally `AGENTUITY_USER_ID`) in the environment for one-off commands.
- Or run `agentuity auth login --api-key ... --user-id ...` to persist credentials in the active profile.
- Run `agentuity auth verify --json` to confirm org/project access without opening a browser.

Environment-only auth takes precedence over stored profile credentials. Profile auth is better for repeated local use; env auth is better for CI and sandboxes.

**Browser login flow:**

1. Generates a one-time password (OTP) by calling `/cli/auth/start`
2. Displays the OTP and authentication URL to the user
3. Automatically opens the browser to the auth URL (on supported platforms)
4. Polls `/cli/auth/check` every 2 seconds for up to 60 seconds
5. Once authenticated, saves the API key, user ID, and expiration to config

**Stored data:**

```yaml
auth:
   api_key: 'your-api-key'
   user_id: 'user-id'
   expires: 1234567890
preferences:
   orgId: ''
```

### `auth verify`

Validate the current credentials without a browser.

```bash
agentuity auth verify --json
```

Returns whether credentials are valid, where they came from (`env` vs `profile`), and accessible organizations.

### `auth logout`

Logout of the Agentuity Cloud Platform by clearing authentication credentials.

```bash
agentuity auth logout
# or
agentuity logout
```

**What it does:**

- Clears `auth.api_key`, `auth.user_id`, and sets `auth.expires` to current time
- Clears `preferences.orgId`
- Writes changes to the active profile config file

## API Endpoints

The authentication flow uses the following API endpoints:

- `GET /cli/auth/start` - Generate OTP for login
- `POST /cli/auth/check` - Poll for login completion with OTP

## URL Configuration

The API and App URLs are determined in the following priority order:

1. **Environment Variables** (highest priority)
   - `AGENTUITY_API_URL` - Override the API base URL
   - `AGENTUITY_APP_URL` - Override the app base URL

2. **Config File Overrides**

   ```yaml
   overrides:
      api_url: https://api.agentuity.io
      app_url: https://app.agentuity.io
   ```

3. **Default Values** (lowest priority)
   - API URL: `https://api.agentuity.com`
   - App URL: `https://app.agentuity.com`

This allows different profiles (e.g., `local`, `production`) to point to different environments.

## Implementation Details

- **Generic API Client**: [../../api.ts](../../api.ts) provides the generic `APIClient` class and `APIError` for HTTP requests
- **Auth-specific APIs**: [api.ts](./api.ts) provides:
   - `generateLoginOTP()` and `pollForLoginCompletion()` for login flow
- **Config Management**: [../../config.ts](../../config.ts) provides `saveAuth()`, `clearAuth()`, and `getAuth()` helpers
- **Browser Opening**: Uses `Bun.spawn(['open', authURL])` on non-Windows platforms to auto-open browser
- **Polling**:
   - Login: Polls every 2 seconds with 60-second timeout
- **Error Handling**: All errors are caught and displayed to user with appropriate exit codes
   - `UpgradeRequiredError`: Shows upgrade instructions when CLI version is outdated
   - `APIError`: Preserves HTTP status codes for proper retry logic (e.g., 404 during login polling)
   - Generic API errors: Display the error message from the server
   - See [../../api-errors.md](../../api-errors.md) for details

## Architecture

Each command has its own `api.ts` file for command-specific API methods and types. The generic `APIClient` class and URL helpers are in the root `api.ts` file, promoting reusability while keeping command-specific logic isolated.
