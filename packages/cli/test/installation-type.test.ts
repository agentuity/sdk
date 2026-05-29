import { describe, test, expect } from 'bun:test';
import { classifyInstallationType } from '../src/utils/installation-type';

const HOME = '/home/dev';
const BUN_INSTALL = '/home/dev/.bun';

describe('classifyInstallationType', () => {
	test('classifies a bun global install (~/.bun/install/global) as global', () => {
		expect(
			classifyInstallationType(
				`${BUN_INSTALL}/install/global/node_modules/@agentuity/cli/bin/cli.ts`,
				HOME,
				BUN_INSTALL
			)
		).toBe('global');
	});

	test('classifies the flat bun global layout (~/.bun/node_modules) as global', () => {
		expect(
			classifyInstallationType(
				`${BUN_INSTALL}/node_modules/@agentuity/cli/bin/cli.ts`,
				HOME,
				BUN_INSTALL
			)
		).toBe('global');
	});

	test('classifies a legacy ~/.agentuity install as global', () => {
		expect(
			classifyInstallationType(
				`${HOME}/.agentuity/node_modules/@agentuity/cli/bin/cli.ts`,
				HOME,
				BUN_INSTALL
			)
		).toBe('global');
	});

	test('classifies a project-local bun store install as local (regression: was misdetected as global)', () => {
		// This is bun's isolated store layout for a workspace/project dependency.
		// The path contains both `/.bun/` and `/node_modules/@agentuity/cli/`, which used to
		// trip the loose global fallback and trigger an un-actionable upgrade prompt on every run.
		const projectStore =
			'/home/dev/code/genesis-mono/node_modules/.bun/@agentuity+cli@2.0.21+abc/node_modules/@agentuity/cli/bin/cli.js';
		expect(classifyInstallationType(projectStore, HOME, BUN_INSTALL)).toBe('local');
	});

	test('classifies a plain project node_modules install as local', () => {
		expect(
			classifyInstallationType(
				'/home/dev/code/app/node_modules/@agentuity/cli/bin/cli.ts',
				HOME,
				BUN_INSTALL
			)
		).toBe('local');
	});

	test('classifies a source checkout as source', () => {
		expect(
			classifyInstallationType('/home/dev/code/sdk/packages/cli/bin/cli.ts', HOME, BUN_INSTALL)
		).toBe('source');
	});

	test('a project-local store under a custom BUN_INSTALL is still local, not global', () => {
		// Even when BUN_INSTALL points somewhere unusual, a project store path
		// (with /node_modules/.bun/) must never resolve to global.
		const projectStore =
			'/srv/ci/workspace/node_modules/.bun/@agentuity+cli@2.0.22+def/node_modules/@agentuity/cli/bin/cli.js';
		expect(classifyInstallationType(projectStore, HOME, '/opt/bun')).toBe('local');
	});
});
