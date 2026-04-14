import { describe, expect, it } from 'bun:test';
import { applyCoderAuthHeaders, getCoderAuthCurlArgs } from '../src/auth.ts';

describe('coder auth helpers', () => {
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
