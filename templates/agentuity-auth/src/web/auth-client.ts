/**
 * Auth client for the frontend.
 *
 * Uses createAuthClient which includes organization and apiKey plugins.
 */

import { createAuthClient } from '@agentuity/auth/react';

export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
