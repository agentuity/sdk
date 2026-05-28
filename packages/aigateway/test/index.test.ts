import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { AIGatewayClient } from '../src/index.ts';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = {
	AGENTUITY_AIGATEWAY_URL: process.env.AGENTUITY_AIGATEWAY_URL,
	AGENTUITY_CLOUD_ORG_ID: process.env.AGENTUITY_CLOUD_ORG_ID,
	AGENTUITY_ORG_ID: process.env.AGENTUITY_ORG_ID,
	AGENTUITY_ORGID: process.env.AGENTUITY_ORGID,
	AGENTUITY_REGION: process.env.AGENTUITY_REGION,
	AGENTUITY_SDK_KEY: process.env.AGENTUITY_SDK_KEY,
};

function restoreEnv(): void {
	for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
}

describe('AIGatewayClient', () => {
	let requestHeaders: Headers | undefined;

	beforeEach(() => {
		restoreEnv();
		process.env.AGENTUITY_AIGATEWAY_URL = 'https://aigateway.test';
		process.env.AGENTUITY_SDK_KEY = 'key_test';
		requestHeaders = undefined;
		globalThis.fetch = async (_input, init) => {
			requestHeaders = new Headers(init?.headers);
			return Response.json({
				choices: [{ message: { role: 'assistant', content: 'Bonjour' } }],
			});
		};
	});

	afterEach(() => {
		globalThis.fetch = ORIGINAL_FETCH;
		restoreEnv();
	});

	test('sends org header from AGENTUITY_ORGID', async () => {
		process.env.AGENTUITY_ORGID = 'org_env';

		const client = new AIGatewayClient();
		await client.complete({
			model: 'openai/gpt-4o-mini',
			messages: [{ role: 'user', content: 'Hello' }],
		});

		expect(requestHeaders?.get('x-agentuity-orgid')).toBe('org_env');
	});

	test('prefers explicit orgId over env org', async () => {
		process.env.AGENTUITY_ORGID = 'org_env';

		const client = new AIGatewayClient({ orgId: 'org_explicit' });
		await client.complete({
			model: 'openai/gpt-4o-mini',
			messages: [{ role: 'user', content: 'Hello' }],
		});

		expect(requestHeaders?.get('x-agentuity-orgid')).toBe('org_explicit');
	});

	test('ignores blank explicit orgId and falls back to env org', async () => {
		process.env.AGENTUITY_ORGID = 'org_env';

		const client = new AIGatewayClient({ orgId: '   ' });
		await client.complete({
			model: 'openai/gpt-4o-mini',
			messages: [{ role: 'user', content: 'Hello' }],
		});

		expect(requestHeaders?.get('x-agentuity-orgid')).toBe('org_env');
	});

	test('falls back to AGENTUITY_CLOUD_ORG_ID', async () => {
		process.env.AGENTUITY_CLOUD_ORG_ID = 'org_cloud';

		const client = new AIGatewayClient();
		await client.complete({
			model: 'openai/gpt-4o-mini',
			messages: [{ role: 'user', content: 'Hello' }],
		});

		expect(requestHeaders?.get('x-agentuity-orgid')).toBe('org_cloud');
	});
});
