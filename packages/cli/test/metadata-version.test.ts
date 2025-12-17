import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { generateMetadata } from '../src/cmd/build/vite/metadata-generator';
import { getVersion } from '../src/version';

describe('Metadata Generation - Version Field', () => {
	let tempDir: string;

	beforeAll(async () => {
		// Create temp directory
		tempDir = await mkdtemp(join(tmpdir(), 'agentuity-test-'));

		// Create minimal project structure
		await mkdir(join(tempDir, 'src'), { recursive: true });
		await mkdir(join(tempDir, '.agentuity'), { recursive: true });

		// Create package.json with @agentuity/runtime dependency
		const packageJson = {
			name: 'test-project',
			version: '1.0.0',
			dependencies: {
				'@agentuity/runtime': '0.0.90', // Different from CLI version
			},
		};
		await writeFile(join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));

		// Create empty app.ts
		await writeFile(join(tempDir, 'app.ts'), 'export default {}');
	});

	afterAll(async () => {
		// Clean up
		if (tempDir) {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	test('should use CLI version not runtime version in metadata', async () => {
		const cliVersion = getVersion();

		const metadata = await generateMetadata({
			rootDir: tempDir,
			agents: [],
			routes: [],
			projectId: 'test-project',
			orgId: 'test-org',
			deploymentId: 'test-deployment',
			logger: {
				trace: () => {},
				debug: () => {},
				info: () => {},
				warn: () => {},
				error: () => {},
				fatal: () => {
					throw new Error('fatal');
				},
			},
		});

		// The build.agentuity field should be CLI version, not runtime version from package.json
		expect(metadata.deployment.build.agentuity).toBe(cliVersion);
		expect(metadata.deployment.build.agentuity).not.toBe('0.0.90'); // Runtime version
		expect(metadata.deployment.build.agentuity).not.toBe('unknown');
	});

	test('should include Bun version in metadata', async () => {
		const metadata = await generateMetadata({
			rootDir: tempDir,
			agents: [],
			routes: [],
			projectId: 'test-project',
			orgId: 'test-org',
			deploymentId: 'test-deployment',
			logger: {
				trace: () => {},
				debug: () => {},
				info: () => {},
				warn: () => {},
				error: () => {},
				fatal: () => {
					throw new Error('fatal');
				},
			},
		});

		expect(metadata.deployment.build.bun).toBe(Bun.version);
	});

	test('should include platform and arch in metadata', async () => {
		const metadata = await generateMetadata({
			rootDir: tempDir,
			agents: [],
			routes: [],
			projectId: 'test-project',
			orgId: 'test-org',
			deploymentId: 'test-deployment',
			logger: {
				trace: () => {},
				debug: () => {},
				info: () => {},
				warn: () => {},
				error: () => {},
				fatal: () => {
					throw new Error('fatal');
				},
			},
		});

		expect(metadata.deployment.build.platform).toBe(process.platform);
		expect(metadata.deployment.build.arch).toBe(process.arch);
	});
});
