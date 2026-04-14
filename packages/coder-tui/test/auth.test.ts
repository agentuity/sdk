import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { applyCoderAuthHeaders, getCoderAuthCurlArgs } from '../src/auth.ts';

const ORIGINAL_AGENTUITY_ORGID = process.env.AGENTUITY_ORGID;
const ORIGINAL_AGENTUITY_CLOUD_ORG_ID = process.env.AGENTUITY_CLOUD_ORG_ID;

describe('coder auth helpers', () => {
	beforeEach(() => {
		delete process.env.AGENTUITY_ORGID;
		delete process.env.AGENTUITY_CLOUD_ORG_ID;
	});

	afterEach(() => {
		if (ORIGINAL_AGENTUITY_ORGID === undefined) {
			delete process.env.AGENTUITY_ORGID;
		} else {
			process.env.AGENTUITY_ORGID = ORIGINAL_AGENTUITY_ORGID;
		}

		if (ORIGINAL_AGENTUITY_CLOUD_ORG_ID === undefined) {
			delete process.env.AGENTUITY_CLOUD_ORG_ID;
		} else {
			process.env.AGENTUITY_CLOUD_ORG_ID = ORIGINAL_AGENTUITY_CLOUD_ORG_ID;
		}
	});

	it('sends hub API keys via x-agentuity-auth-api-key', () => {
		expect(applyCoderAuthHeaders({}, 'agc_test_key')).toEqual({
			'x-agentuity-auth-api-key': 'agc_test_key',
		});
		expect(getCoderAuthCurlArgs('agc_test_key')).toEqual([
			'-H',
			'x-agentuity-auth-api-key: agc_test_key',
		]);
	});

	it('sends CLI auth tokens via Authorization bearer', () => {
		expect(applyCoderAuthHeaders({}, 'ck_live_test_token')).toEqual({
			Authorization: 'Bearer ck_live_test_token',
		});
		expect(getCoderAuthCurlArgs('ck_live_test_token')).toEqual([
			'-H',
			'Authorization: Bearer ck_live_test_token',
		]);
	});

	it('returns a new headers object without mutating the caller input', () => {
		const originalHeaders = { accept: 'application/json' };
		const result = applyCoderAuthHeaders(originalHeaders, 'agc_test_key', 'org_test');

		expect(result).toEqual({
			accept: 'application/json',
			'x-agentuity-auth-api-key': 'agc_test_key',
			'x-agentuity-orgid': 'org_test',
		});
		expect(originalHeaders).toEqual({
			accept: 'application/json',
		});
		expect(result).not.toBe(originalHeaders);
	});

	it('falls back to AGENTUITY_CLOUD_ORG_ID when AGENTUITY_ORGID is unset', () => {
		process.env.AGENTUITY_CLOUD_ORG_ID = 'org_cloud';

		expect(applyCoderAuthHeaders({}, 'ck_live_test_token')).toEqual({
			Authorization: 'Bearer ck_live_test_token',
			'x-agentuity-orgid': 'org_cloud',
		});
		expect(getCoderAuthCurlArgs('ck_live_test_token')).toEqual([
			'-H',
			'x-agentuity-orgid: org_cloud',
			'-H',
			'Authorization: Bearer ck_live_test_token',
		]);
	});

	it('includes org headers when present', () => {
		expect(applyCoderAuthHeaders({}, 'ck_live_test_token', 'org_test')).toEqual({
			Authorization: 'Bearer ck_live_test_token',
			'x-agentuity-orgid': 'org_test',
		});
		expect(getCoderAuthCurlArgs('ck_live_test_token', 'org_test')).toEqual([
			'-H',
			'x-agentuity-orgid: org_test',
			'-H',
			'Authorization: Bearer ck_live_test_token',
		]);
	});

	it('leaves headers unchanged when no auth token is available', () => {
		expect(applyCoderAuthHeaders({ accept: 'application/json' })).toEqual({
			accept: 'application/json',
		});
		expect(getCoderAuthCurlArgs()).toEqual([]);
	});
});
