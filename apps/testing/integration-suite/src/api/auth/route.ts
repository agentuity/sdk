import { createRouter } from '@agentuity/runtime';

interface LoginRequest {
	username: string;
	password: string;
}

interface LoginResponse {
	token: string;
	expiresAt: number;
}

const router = createRouter();

router.post('/login', async (c) => {
	const body = (await c.req.json()) as LoginRequest;

	const response: LoginResponse = {
		token: `token-${body.username}`,
		expiresAt: Date.now() + 3600000,
	};

	return c.json(response);
});

router.post('/logout', async (c) => {
	return c.json({ success: true });
});

router.get('/verify', async (c) => {
	const authHeader = c.req.header('Authorization');
	return c.json({ valid: !!authHeader });
});

export default router;
