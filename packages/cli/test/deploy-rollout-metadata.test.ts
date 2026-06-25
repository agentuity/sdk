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
});

describe('mergeDeployRolloutMetadata', () => {
	test('merges rollout_id onto deployment metadata', () => {
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
				}
			)
		).toEqual({
			deployment: {
				source: 'managed',
				channel: 'edge',
				rollout_id: 'rollout_test',
			},
		});
	});
});
