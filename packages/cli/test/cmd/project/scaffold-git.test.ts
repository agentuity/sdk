import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { commitAgentuityAugmentation } from '../../../src/cmd/project/scaffold';

function git(cwd: string, args: string[]): string {
	return execFileSync('git', args, {
		cwd,
		encoding: 'utf8',
		env: {
			...process.env,
			GIT_COMMITTER_NAME: 'Test User',
			GIT_COMMITTER_EMAIL: 'test@example.com',
		},
	});
}

function hasGit(): boolean {
	return spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0;
}

describe('project scaffold git helpers', () => {
	let testDir: string;

	beforeEach(() => {
		testDir = mkdtempSync(join(tmpdir(), 'agentuity-scaffold-git-'));
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	test('commits Agentuity augmentation changes in an existing git repo', async () => {
		if (!hasGit()) return;

		git(testDir, ['init']);
		writeFileSync(join(testDir, 'package.json'), '{"name":"demo"}\n');
		git(testDir, ['add', '.']);
		git(testDir, [
			'-c',
			'commit.gpgsign=false',
			'commit',
			'--author=Test User <test@example.com>',
			'-m',
			'Initial framework scaffold',
		]);

		writeFileSync(join(testDir, 'package.json'), '{"name":"demo","devDependencies":{}}\n');
		writeFileSync(join(testDir, 'service.ts'), 'export const enabled = true;\n');

		await commitAgentuityAugmentation(testDir, {
			services: ['db', 'queue'],
			author: { name: 'Agentuity Bot', email: 'bot@agentuity.com' },
		});

		const message = git(testDir, ['log', '-1', '--pretty=%s']).trim();
		expect(message).toBe('Augmented with Agentuity examples for services: Database, Queue');
		expect(git(testDir, ['status', '--porcelain']).trim()).toBe('');
	});
});
