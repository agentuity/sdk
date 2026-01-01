/**
 * Auth client for the frontend.
 *
 * Uses the Agentuity-provided client factory for zero-config setup.
 * Import from '@agentuity/auth/react' for the React-specific client.
 */

import { createAuthClient } from '@agentuity/auth/react';
import { lastLoginMethodClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
	plugins: [lastLoginMethodClient()],
});

// Export both function APIs and hooks for demos
export const { signIn, signUp, signOut, useSession, getSession, getLastUsedLoginMethod } =
	authClient;
