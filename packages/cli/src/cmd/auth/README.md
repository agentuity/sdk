# Authentication Commands

The auth command provides authentication and authorization functionality for the Agentuity Platform.

## Commands

### `auth login`

Login to the Agentuity Platform using a browser-based authentication flow.

```bash
agentuity auth login
# or
agentuity login
```

**How it works:**

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

### `auth signup`

Create a new Agentuity Cloud Platform account.

```bash
agentuity auth signup
# or
agentuity signup
```

**How it works:**

1. Generates a random 5-character OTP locally (client-side)
2. Displays a signup URL with the OTP code: `/sign-up?code=<otp>`
3. User opens the URL in their browser and completes the signup process
4. Polls `GET /cli/auth/signup/<otp>` every 2 seconds for up to 5 minutes
5. Server returns 404 until signup is complete, then returns credentials
6. Once complete, saves the API key, user ID, and expiration to config

**Stored data:**

```yaml
auth:
   api_key: 'your-api-key'
   user_id: 'user-id'
   expires: 1234567890
```

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
- `GET /cli/auth/signup/<otp>` - Poll for signup completion with client-generated OTP (returns 404 until complete)

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
   - `generateSignupOTP()` and `pollForSignupCompletion()` for signup flow
- **Config Management**: [../../config.ts](../../config.ts) provides `saveAuth()`, `clearAuth()`, and `getAuth()` helpers
- **Browser Opening**: Uses `Bun.spawn(['open', authURL])` on non-Windows platforms to auto-open browser
- **Polling**:
   - Login: Polls every 2 seconds with 60-second timeout
   - Signup: Polls every 2 seconds with 5-minute timeout, retries on 404 errors
- **Error Handling**: All errors are caught and displayed to user with appropriate exit codes
   - `UpgradeRequiredError`: Shows upgrade instructions when CLI version is outdated
   - `APIError`: Preserves HTTP status codes for proper retry logic (e.g., 404 during signup polling)
   - Generic API errors: Display the error message from the server
   - See [../../api-errors.md](../../api-errors.md) for details

## Architecture

Each command has its own `api.ts` file for command-specific API methods and types. The generic `APIClient` class and URL helpers are in the root `api.ts` file, promoting reusability while keeping command-specific logic isolated.
