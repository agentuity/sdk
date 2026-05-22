/**
 * Verifies that `generateDeployMetadata` pins `project.name` to the cloud's
 * registered project name when one is provided, rather than the
 * package.json `name` field.
 *
 * Background: once a project is registered, the cloud is the source of
 * truth for the project's name. The server enforces name uniqueness
 * within an organization, so sending whatever `package.json` happens to
 * contain causes a "project already exists" error if the user has renamed
 * `package.json` to something that collides with another project in the
 * same org. Pinning the metadata to the cloud's name keeps deploys idempotent.
 */

import { describe, test, expect } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateDeployMetadata } from '../../../src/deploy-metadata';
import type { BuildResult } from '../../../src/cmd/build/adapters/types';
import type { PackageResult } from '../../../src/cmd/build/package';

const logger = {
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	fatal: (() => {
		throw new Error('fatal');
	}) as never,
	child: () => logger,
};

function makeFixture(pkgName: string): {
	projectDir: string;
	buildResult: BuildResult;
	packageResult: PackageResult;
	cleanup: () => void;
} {
	const projectDir = join(
		tmpdir(),
		`name-pin-${Date.now()}-${Math.random().toString(36).slice(2)}`
	);
	mkdirSync(projectDir, { recursive: true });
	writeFileSync(
		join(projectDir, 'package.json'),
		JSON.stringify({ name: pkgName, version: '1.0.0' })
	);
	const outputDir = join(projectDir, '.agentuity');
	mkdirSync(outputDir, { recursive: true });

	const buildResult: BuildResult = {
		outputDir,
		staticDir: undefined,
		logs: [],
	};
	const packageResult: PackageResult = {
		launch: {
			processes: [{ command: 'node server.js' }],
			framework: 'hono',
			runtime: 'node',
		},
	} as unknown as PackageResult;

	return {
		projectDir,
		buildResult,
		packageResult,
		cleanup: () => rmSync(projectDir, { recursive: true, force: true }),
	};
}

describe('generateDeployMetadata project name pinning', () => {
	test('uses registeredProjectName over package.json name when provided', async () => {
		const { projectDir, buildResult, packageResult, cleanup } = makeFixture('renamed-pkg');
		try {
			const metadata = await generateDeployMetadata({
				buildResult,
				packageResult,
				projectDir,
				projectId: 'proj_abc',
				orgId: 'org_1',
				region: 'us-east-1',
				deploymentId: 'deploy_1',
				registeredProjectName: 'original-cloud-name',
				logger,
			});
			expect(metadata.project.name).toBe('original-cloud-name');
		} finally {
			cleanup();
		}
	});

	test('falls back to package.json name when registeredProjectName is omitted', async () => {
		const { projectDir, buildResult, packageResult, cleanup } = makeFixture('my-pkg');
		try {
			const metadata = await generateDeployMetadata({
				buildResult,
				packageResult,
				projectDir,
				projectId: 'proj_abc',
				orgId: 'org_1',
				region: 'us-east-1',
				deploymentId: 'deploy_1',
				logger,
			});
			expect(metadata.project.name).toBe('my-pkg');
		} finally {
			cleanup();
		}
	});
});
