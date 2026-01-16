import { describe, test, expect } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Use the integration suite's built metadata since it has evals
const INTEGRATION_SUITE_DIR = join(
	__dirname,
	'..',
	'..',
	'..',
	'apps',
	'testing',
	'integration-suite'
);
const METADATA_PATH = join(INTEGRATION_SUITE_DIR, '.agentuity', 'agentuity.metadata.json');

interface EvalMetadata {
	id: string;
	identifier: string;
	name: string;
	filename: string;
	version: string;
	description?: string;
	agentIdentifier: string;
	projectId: string;
}

interface AgentMetadata {
	id: string;
	agentId: string;
	name: string;
	filename: string;
	evals?: EvalMetadata[];
}

interface Metadata {
	agents: AgentMetadata[];
}

// Check if metadata file exists before running tests
function ensureMetadataExists() {
	if (!existsSync(METADATA_PATH)) {
		throw new Error(
			'Integration suite metadata not found. ' +
				'Build integration-suite first: cd apps/testing/integration-suite && bun run build'
		);
	}
}

describe('Eval Metadata Generation', () => {
	test('integration suite should have metadata file', () => {
		ensureMetadataExists();
		expect(existsSync(METADATA_PATH)).toBe(true);
	});

	test('metadata.json should contain agents with evals', () => {
		ensureMetadataExists();
		const metadata: Metadata = JSON.parse(readFileSync(METADATA_PATH, 'utf-8'));

		expect(metadata.agents).toBeDefined();
		expect(Array.isArray(metadata.agents)).toBe(true);

		// Find agent with evals
		const agentsWithEvals = metadata.agents.filter((a) => a.evals && a.evals.length > 0);
		expect(agentsWithEvals.length).toBeGreaterThan(0);
	});

	test('eval id should have evalid_ prefix', () => {
		ensureMetadataExists();
		const metadata: Metadata = JSON.parse(readFileSync(METADATA_PATH, 'utf-8'));

		for (const agent of metadata.agents) {
			if (agent.evals) {
				for (const evalMeta of agent.evals) {
					expect(evalMeta.id).toMatch(/^evalid_[a-f0-9]+$/);
				}
			}
		}
	});

	test('eval identifier should have eval_ prefix', () => {
		ensureMetadataExists();
		const metadata: Metadata = JSON.parse(readFileSync(METADATA_PATH, 'utf-8'));

		for (const agent of metadata.agents) {
			if (agent.evals) {
				for (const evalMeta of agent.evals) {
					expect(evalMeta.identifier).toMatch(/^eval_[a-f0-9]+$/);
				}
			}
		}
	});

	test('eval should have required fields', () => {
		ensureMetadataExists();
		const metadata: Metadata = JSON.parse(readFileSync(METADATA_PATH, 'utf-8'));

		for (const agent of metadata.agents) {
			if (agent.evals) {
				for (const evalMeta of agent.evals) {
					expect(evalMeta.id).toBeDefined();
					expect(evalMeta.identifier).toBeDefined();
					expect(evalMeta.name).toBeDefined();
					expect(evalMeta.filename).toBeDefined();
					expect(evalMeta.version).toBeDefined();
					expect(evalMeta.agentIdentifier).toBeDefined();
					expect(evalMeta.projectId).toBeDefined();
				}
			}
		}
	});

	test('eval agentIdentifier should match parent agent agentId', () => {
		ensureMetadataExists();
		const metadata: Metadata = JSON.parse(readFileSync(METADATA_PATH, 'utf-8'));

		for (const agent of metadata.agents) {
			if (agent.evals) {
				for (const evalMeta of agent.evals) {
					expect(evalMeta.agentIdentifier).toBe(agent.agentId);
				}
			}
		}
	});

	test('eval version should be a valid SHA256 hash', () => {
		ensureMetadataExists();
		const metadata: Metadata = JSON.parse(readFileSync(METADATA_PATH, 'utf-8'));

		for (const agent of metadata.agents) {
			if (agent.evals) {
				for (const evalMeta of agent.evals) {
					// SHA256 hash is 64 hex characters
					expect(evalMeta.version).toMatch(/^[a-f0-9]{64}$/);
				}
			}
		}
	});

	test('agent agentId should have agent_ prefix', () => {
		ensureMetadataExists();
		const metadata: Metadata = JSON.parse(readFileSync(METADATA_PATH, 'utf-8'));

		for (const agent of metadata.agents) {
			expect(agent.agentId).toMatch(/^agent_[a-f0-9]+$/);
		}
	});

	test('agent id should have agentid_ prefix', () => {
		ensureMetadataExists();
		const metadata: Metadata = JSON.parse(readFileSync(METADATA_PATH, 'utf-8'));

		for (const agent of metadata.agents) {
			expect(agent.id).toMatch(/^agentid_[a-f0-9]+$/);
		}
	});
});
