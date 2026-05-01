import { createAuthClient } from '@agentuity/auth/react';

export const authClient = createAuthClient();

export const { getSession, signIn, signOut, signUp, useSession } = authClient;
