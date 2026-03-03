import { createRouter } from '@agentuity/runtime';

interface UserProfile {
	id: string;
	username: string;
	email: string;
	createdAt: number;
}

type ProfileUpdate = Partial<Omit<UserProfile, 'id' | 'createdAt'>>;

const router = createRouter();

router.get('/', async (c) => {
	const profile: UserProfile = {
		id: 'user-123',
		username: 'testuser',
		email: 'test@example.com',
		createdAt: Date.now(),
	};

	return c.json(profile);
});

router.patch('/', async (c) => {
	const updates = (await c.req.json()) as ProfileUpdate;

	const updatedProfile: UserProfile = {
		id: 'user-123',
		username: updates.username || 'testuser',
		email: updates.email || 'test@example.com',
		createdAt: Date.now() - 86400000,
	};

	return c.json(updatedProfile);
});

router.delete('/', async (c) => {
	return c.json({ deleted: true });
});

export default router;
