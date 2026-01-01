/**
 * Auth client for the frontend.
 *
 * Uses the Agentuity-provided client factory for zero-config setup.
 * Import from '@agentuity/auth/react' for the React-specific client.
 */

import { createAuthClient } from '@agentuity/auth/react';

export const authClient = createAuthClient();

// Export both function APIs and hooks for demos
export const { signIn, signUp, signOut, useSession, getSession } = authClient;
