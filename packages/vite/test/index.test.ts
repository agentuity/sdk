import { afterEach, describe, expect, test } from 'bun:test';
import agentuity from '../src/index.ts';

const ENV_HOSTNAME = 'AGENTUITY_DEVMODE_HOSTNAME';
const previousHostname = process.env[ENV_HOSTNAME];

afterEach(() => {
	if (previousHostname === undefined) {
		delete process.env[ENV_HOSTNAME];
	} else {
		process.env[ENV_HOSTNAME] = previousHostname;
	}
});

describe('@agentuity/vite', () => {
	test('is a serve-only Vite plugin', () => {
		const plugin = agentuity();

		expect(plugin.name).toBe('agentuity:devmode');
		expect(plugin.apply).toBe('serve');
	});

	test('does nothing without a devmode hostname', () => {
		delete process.env[ENV_HOSTNAME];
		const plugin = agentuity();

		expect(typeof plugin.config).toBe('function');
		if (typeof plugin.config !== 'function') {
			throw new Error('expected config hook');
		}

		expect(plugin.config()).toBeUndefined();
	});

	test('configures allowed hosts and HMR for the devmode hostname', () => {
		const plugin = agentuity({ hostname: 'example.agentuity-us.live' });

		expect(typeof plugin.config).toBe('function');
		if (typeof plugin.config !== 'function') {
			throw new Error('expected config hook');
		}

		expect(plugin.config()).toEqual({
			server: {
				allowedHosts: ['example.agentuity-us.live'],
				hmr: {
					host: 'example.agentuity-us.live',
					clientPort: 443,
					protocol: 'wss',
				},
			},
		});
	});
});
