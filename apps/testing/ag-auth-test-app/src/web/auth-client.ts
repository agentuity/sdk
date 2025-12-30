/**
 * Agentuity Auth client for the frontend.
 *
 * Uses the Agentuity-provided client factory for zero-config setup.
 * Import from '@agentuity/auth/react' for the React-specific client.
 */

import { createAgentuityAuthClient } from '@agentuity/auth/react';

export const authClient = createAgentuityAuthClient();

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
