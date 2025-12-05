import { describe, test, expect } from 'bun:test';
import {
	SessionStartEventSchema,
	SessionCompleteEventSchema,
	type SessionStartEvent,
	type SessionCompleteEvent,
	type SessionEventProvider,
} from '../src/services/session';

describe('Session event schemas', () => {
	test('should validate SessionStartEvent', () => {
		const event: SessionStartEvent = {
			id: 'session-123',
			orgId: 'org-456',
			projectId: 'project-789',
			routeId: 'route-abc',
			environment: 'production',
			devmode: false,
			url: 'https://api.example.com/test',
			method: 'POST',
			trigger: 'api',
		};

		const result = SessionStartEventSchema.safeParse(event);
		expect(result.success).toBe(true);
	});

	test('should validate SessionStartEvent with optional fields', () => {
		const event: SessionStartEvent = {
			id: 'session-123',
			threadId: 'thread-xyz',
			orgId: 'org-456',
			projectId: 'project-789',
			deploymentId: 'deployment-001',
			routeId: 'route-abc',
			environment: 'staging',
			devmode: true,
			url: 'https://api.example.com/test',
			method: 'GET',
			trigger: 'agent',
		};

		const result = SessionStartEventSchema.safeParse(event);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.threadId).toBe('thread-xyz');
			expect(result.data.deploymentId).toBe('deployment-001');
		}
	});

	test('should validate all trigger types', () => {
		const triggers = ['agent', 'api', 'email', 'sms', 'cron', 'manual'] as const;

		triggers.forEach((trigger) => {
			const event: SessionStartEvent = {
				id: 'session-123',
				orgId: 'org-456',
				projectId: 'project-789',
				routeId: 'route-abc',
				environment: 'production',
				devmode: false,
				url: 'https://api.example.com/test',
				method: 'POST',
				trigger,
			};

			const result = SessionStartEventSchema.safeParse(event);
			expect(result.success).toBe(true);
		});
	});

	test('should validate SessionCompleteEvent', () => {
		const event: SessionCompleteEvent = {
			id: 'session-123',
			threadId: 'thread-xyz',
			statusCode: 200,
		};

		const result = SessionCompleteEventSchema.safeParse(event);
		expect(result.success).toBe(true);
	});

	test('should validate SessionCompleteEvent with error', () => {
		const event: SessionCompleteEvent = {
			id: 'session-123',
			threadId: null,
			error: 'Something went wrong',
			statusCode: 500,
		};

		const result = SessionCompleteEventSchema.safeParse(event);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.error).toBe('Something went wrong');
			expect(result.data.threadId).toBeNull();
		}
	});

	test('should validate SessionCompleteEvent with agent IDs and user data', () => {
		const event: SessionCompleteEvent = {
			id: 'session-123',
			threadId: 'thread-xyz',
			agentIds: ['agent-1', 'agent-2'],
			statusCode: 200,
			userData: JSON.stringify({ userId: '789', action: 'completed' }),
		};

		const result = SessionCompleteEventSchema.safeParse(event);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.agentIds).toEqual(['agent-1', 'agent-2']);
			expect(result.data.userData).toBeDefined();
		}
	});
});

describe('SessionEventProvider interface', () => {
	test('should implement SessionEventProvider', () => {
		const mockProvider: SessionEventProvider = {
			start: async (_event: SessionStartEvent) => {},
			complete: async (_event: SessionCompleteEvent) => {},
		};

		expect(typeof mockProvider.start).toBe('function');
		expect(typeof mockProvider.complete).toBe('function');
	});

	test('should handle async start event', async () => {
		let captured: SessionStartEvent | null | undefined;

		const provider: SessionEventProvider = {
			start: async (event: SessionStartEvent) => {
				captured = event;
			},
			complete: async (_event: SessionCompleteEvent) => {},
		};

		const event: SessionStartEvent = {
			id: 'session-123',
			orgId: 'org-456',
			projectId: 'project-789',
			routeId: 'route-abc',
			environment: 'test',
			devmode: true,
			url: 'https://api.example.com',
			method: 'GET',
			trigger: 'manual',
		};

		await provider.start(event);
		expect(captured).not.toBe(null);
		if (captured) {
			expect(captured.id).toBe(event.id);
		}
	});

	test('should handle async complete event', async () => {
		let captured: SessionCompleteEvent | null | undefined;

		const provider: SessionEventProvider = {
			start: async (_event: SessionStartEvent) => {},
			complete: async (event: SessionCompleteEvent) => {
				captured = event;
			},
		};

		const event: SessionCompleteEvent = {
			id: 'session-123',
			threadId: 'thread-xyz',
			statusCode: 200,
		};

		await provider.complete(event);
		expect(captured).not.toBe(null);
		if (captured) {
			expect(captured.id).toBe(event.id);
		}
	});
});
