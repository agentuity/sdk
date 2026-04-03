import { describe, expect, it } from 'bun:test';
import { buildInboundRpcPromptText, getInboundRpcDeliverAs } from '../src/inbound-rpc.ts';

describe('inbound rpc helpers', () => {
	it('prefixes non-lead targeted prompts with the agent mention', () => {
		expect(
			buildInboundRpcPromptText({
				type: 'prompt',
				message: 'Review this diff',
				targetAgent: 'reviewer',
			})
		).toBe('@reviewer Review this diff');

		expect(
			buildInboundRpcPromptText({
				type: 'prompt',
				message: 'Handle orchestration',
				targetAgent: 'lead',
			})
		).toBe('Handle orchestration');
	});

	it('routes active prompt and follow-up commands as followUp deliveries', () => {
		expect(getInboundRpcDeliverAs('prompt', false)).toBe('followUp');
		expect(getInboundRpcDeliverAs('follow_up', false)).toBe('followUp');
		expect(getInboundRpcDeliverAs('prompt', true)).toBeUndefined();
	});

	it('routes active steer commands as steer deliveries', () => {
		expect(getInboundRpcDeliverAs('steer', false)).toBe('steer');
		expect(getInboundRpcDeliverAs('steer', true)).toBeUndefined();
	});
});
