/**
 * Agentuity Auth client for the frontend.
 *
 * Uses createAgentuityAuthClient which includes organization and apiKey plugins.
 */

import { createAgentuityAuthClient } from '@agentuity/auth/react';

export const authClient = createAgentuityAuthClient();

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
