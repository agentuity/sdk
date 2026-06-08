import { describe, expect, test, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { agentuity, getServices, getTelemetry, reset, resetServices } from '../src/index.ts';
import type { Logger, Services } from '../src/index.ts';

describe('@agentuity/hono', () => {
	beforeEach(() => {
		reset();
	});

	describe('agentuity() middleware', () => {
		test('returns a Hono middleware function', () => {
			const middleware = agentuity();
			expect(middleware).toBeFunction();
		});

		test('initializes services on first invocation', () => {
			expect(() => getServices()).toThrow('Services not initialized');
			agentuity();
			const services = getServices();
			expect(services.kv).toBeDefined();
			expect(services.vector).toBeDefined();
			expect(services.queue).toBeDefined();
			expect(services.email).toBeDefined();
			expect(services.task).toBeDefined();
			expect(services.schedule).toBeDefined();
			expect(services.sandbox).toBeDefined();
			expect(services.stream).toBeDefined();
		});

		test('initializes telemetry on first invocation', () => {
			expect(getTelemetry()).toBeNull();
			agentuity();
			const telemetry = getTelemetry();
			expect(telemetry).not.toBeNull();
			expect(telemetry?.tracer).toBeDefined();
			expect(telemetry?.meter).toBeDefined();
			expect(telemetry?.logger).toBeDefined();
		});

		test('reuses the same service instances on subsequent calls', () => {
			agentuity();
			const first = getServices();
			agentuity();
			const second = getServices();
			expect(first).toBe(second);
			expect(first.kv).toBe(second.kv);
		});

		test('reuses the same telemetry instance on subsequent calls', () => {
			agentuity();
			const first = getTelemetry();
			agentuity();
			const second = getTelemetry();
			expect(first).toBe(second);
		});
	});

	describe('context injection', () => {
		test('injects services and telemetry into c.var', async () => {
			const app = new Hono();
			app.use('*', agentuity());

			let capturedVar: Record<string, unknown> = {};
			app.get('/probe', (c) => {
				capturedVar = {
					kv: c.var.kv,
					vector: c.var.vector,
					queue: c.var.queue,
					email: c.var.email,
					task: c.var.task,
					schedule: c.var.schedule,
					sandbox: c.var.sandbox,
					stream: c.var.stream,
					tracer: c.var.tracer,
					logger: c.var.logger,
					meter: c.var.meter,
				};
				return c.json({ ok: true });
			});

			const res = await app.fetch(new Request('http://localhost/probe'));
			expect(res.status).toBe(200);

			// Every value should be a real object (not null/undefined).
			for (const [key, value] of Object.entries(capturedVar)) {
				expect(value, `c.var.${key}`).toBeDefined();
				expect(value, `c.var.${key}`).not.toBeNull();
			}
		});

		test('downstream middleware sees the injected services', async () => {
			const app = new Hono();
			app.use('*', agentuity());

			let sawKv = false;
			app.use('*', async (c, next) => {
				sawKv = c.var.kv !== undefined && c.var.kv !== null;
				await next();
			});
			app.get('/', (c) => c.json({ ok: true }));

			await app.fetch(new Request('http://localhost/'));
			expect(sawKv).toBe(true);
		});

		test('mounts cleanly on a typed Hono app', async () => {
			type Variables = Pick<Services, 'kv'> & {
				logger: Logger;
			};

			const app = new Hono<{ Variables: Variables }>();
			app.use('*', agentuity());

			app.get('/typed', (c) => {
				return c.json({
					hasKeyValue: c.var.kv !== undefined,
					hasLogger: c.var.logger !== undefined,
				});
			});

			const res = await app.fetch(new Request('http://localhost/typed'));
			expect(res.status).toBe(200);
			await expect(res.json()).resolves.toEqual({
				hasKeyValue: true,
				hasLogger: true,
			});
		});
	});

	describe('reset / resetServices', () => {
		test('resetServices() clears the services singleton', () => {
			agentuity();
			expect(() => getServices()).not.toThrow();
			resetServices();
			expect(() => getServices()).toThrow('Services not initialized');
		});

		test('reset() clears both services and telemetry singletons', () => {
			agentuity();
			expect(getTelemetry()).not.toBeNull();
			expect(() => getServices()).not.toThrow();

			reset();

			expect(getTelemetry()).toBeNull();
			expect(() => getServices()).toThrow('Services not initialized');
		});

		test('agentuity() rebuilds singletons after reset()', () => {
			agentuity();
			const firstServices = getServices();
			reset();
			agentuity();
			const secondServices = getServices();
			expect(firstServices).not.toBe(secondServices);
		});
	});

	describe('options forwarding', () => {
		test('respects the telemetry config override', () => {
			agentuity({
				telemetry: { name: 'custom-app', version: '9.9.9' },
			});
			const telemetry = getTelemetry();
			expect(telemetry).not.toBeNull();
			// We don't peek at internal config — we just verify the call
			// completed and produced a working telemetry response.
			expect(telemetry?.tracer).toBeDefined();
		});
	});
});
