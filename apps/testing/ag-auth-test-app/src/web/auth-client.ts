/**
 * BetterAuth client for the frontend.
 *
 * This creates a type-safe client for interacting with BetterAuth endpoints.
 */

import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
	baseURL: window.location.origin,
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
