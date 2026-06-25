import { describe, expect, test } from 'bun:test';

import {
	mergeDeployRolloutMetadata,
	parseDeployRolloutMetadata,
} from '../src/deploy-rollout-metadata';

describe('parseDeployRolloutMetadata', () => {
	test('accepts rollout_id for Obs-triggered managed deploys', () => {
		expect(
			parseDeployRolloutMetadata(
				'{"source":"managed","channel":"edge","rollout_id":"rollout_3FdsBqGeMpUSDtpBt1uz2n6Drps"}'
			)
		).toEqual({
			source: 'managed',
			channel: 'edge',
			rollout_id: 'rollout_3FdsBqGeMpUSDtpBt1uz2n6Drps',
		});
	});

	test('passes through unknown keys for forward-compatible managed metadata', () => {
		expect(
			parseDeployRolloutMetadata(
				'{"source":"managed","channel":"edge","rollout_id":"rollout_test","initiated_by":"user_abc"}'
			)
		).toEqual({
			source: 'managed',
			channel: 'edge',
			rollout_id: 'rollout_test',
			initiated_by: 'user_abc',
		});
	});

	test('rejects invalid known fields', () => {
		expect(() => parseDeployRolloutMetadata('{"source":"github","channel":"edge"}')).toThrow(
			'Invalid deploy metadata'
		);
	});
});

describe('mergeDeployRolloutMetadata', () => {
	test('merges rollout metadata onto deployment', () => {
		expect(
			mergeDeployRolloutMetadata(
				{
					deployment: {
						source: 'managed',
						channel: 'edge',
					},
				},
				{
					source: 'managed',
					channel: 'edge',
					rollout_id: 'rollout_test',
					initiated_by: 'user_abc',
				}
			)
		).toEqual({
			deployment: {
				source: 'managed',
				channel: 'edge',
				rollout_id: 'rollout_test',
				initiated_by: 'user_abc',
			},
		});
	});
});
