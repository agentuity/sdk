/**
 * BetterAuth client for the frontend.
 *
 * Uses the Agentuity-provided client factory for zero-config setup.
 * Import from '@agentuity/auth/agentuity/react' for the React-specific client.
 */

import { createAgentuityAuthClient } from '@agentuity/auth/agentuity/react';

export const authClient = createAgentuityAuthClient();

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
