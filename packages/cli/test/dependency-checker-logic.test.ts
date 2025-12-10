import { describe, test, expect } from 'bun:test';
import { shouldUpgradeVersion } from '../src/utils/dependency-checker';

describe('dependency-checker logic', () => {
	describe('shouldUpgradeVersion', () => {
		describe('always upgrade cases', () => {
			test('should upgrade "latest"', () => {
				expect(shouldUpgradeVersion('latest')).toBe(true);
			});

			test('should upgrade "*"', () => {
				expect(shouldUpgradeVersion('*')).toBe(true);
			});

			test('should upgrade caret ranges', () => {
				expect(shouldUpgradeVersion('^1.0.0')).toBe(true);
				expect(shouldUpgradeVersion('^2.5.3')).toBe(true);
				expect(shouldUpgradeVersion('^0.0.1')).toBe(true);
			});

			test('should upgrade tilde ranges', () => {
				expect(shouldUpgradeVersion('~1.0.0')).toBe(true);
				expect(shouldUpgradeVersion('~2.5.3')).toBe(true);
			});

			test('should upgrade greater than ranges', () => {
				expect(shouldUpgradeVersion('>1.0.0')).toBe(true);
				expect(shouldUpgradeVersion('>=1.0.0')).toBe(true);
				expect(shouldUpgradeVersion('>2.5.3')).toBe(true);
				expect(shouldUpgradeVersion('>=2.5.3')).toBe(true);
			});

			test('should upgrade less than ranges', () => {
				expect(shouldUpgradeVersion('<1.0.0')).toBe(true);
				expect(shouldUpgradeVersion('<=1.0.0')).toBe(true);
			});

			test('should upgrade complex ranges', () => {
				expect(shouldUpgradeVersion('>=1.0.0 <2.0.0')).toBe(true);
			});
		});

		describe('never upgrade cases', () => {
			test('should NOT upgrade exact versions', () => {
				expect(shouldUpgradeVersion('1.0.0')).toBe(false);
				expect(shouldUpgradeVersion('2.5.3')).toBe(false);
				expect(shouldUpgradeVersion('0.0.1')).toBe(false);
			});

			test('should NOT upgrade exact versions with prerelease tags', () => {
				expect(shouldUpgradeVersion('1.0.0-alpha.1')).toBe(false);
				expect(shouldUpgradeVersion('2.5.3-beta')).toBe(false);
				expect(shouldUpgradeVersion('1.0.0-rc.1')).toBe(false);
			});

			test('should NOT upgrade exact versions with build metadata', () => {
				expect(shouldUpgradeVersion('1.0.0+20130313144700')).toBe(false);
				expect(shouldUpgradeVersion('1.0.0-beta+exp.sha.5114f85')).toBe(false);
			});
		});

		describe('edge cases', () => {
			test('should handle empty string', () => {
				expect(shouldUpgradeVersion('')).toBe(false);
			});

			test('should handle workspace protocol', () => {
				// workspace:* is a special case - the "*" is part of the protocol
				expect(shouldUpgradeVersion('workspace:*')).toBe(false);
				expect(shouldUpgradeVersion('workspace:^1.0.0')).toBe(false);
			});

			test('should handle file: protocol', () => {
				expect(shouldUpgradeVersion('file:../some-package')).toBe(false);
			});

			test('should handle link: protocol', () => {
				expect(shouldUpgradeVersion('link:../some-package')).toBe(false);
			});

			test('should handle git URLs', () => {
				expect(shouldUpgradeVersion('git+https://github.com/user/repo.git')).toBe(false);
				expect(shouldUpgradeVersion('github:user/repo')).toBe(false);
			});

			test('should handle npm: protocol', () => {
				expect(shouldUpgradeVersion('npm:other-package@1.0.0')).toBe(false);
			});
		});
	});

	describe('version parsing patterns', () => {
		test('recognizes standard semver format', () => {
			const validSemver = [
				'1.0.0',
				'0.0.1',
				'10.20.30',
				'1.0.0-alpha',
				'1.0.0-alpha.1',
				'1.0.0-0.3.7',
				'1.0.0-x.7.z.92',
				'1.0.0+20130313144700',
			];

			for (const version of validSemver) {
				expect(shouldUpgradeVersion(version)).toBe(false);
			}
		});

		test('recognizes range patterns', () => {
			const validRanges = [
				'^1.0.0',
				'~1.0.0',
				'>1.0.0',
				'>=1.0.0',
				'<2.0.0',
				'<=2.0.0',
				'^0.0.1',
				'~0.0.1',
			];

			for (const range of validRanges) {
				expect(shouldUpgradeVersion(range)).toBe(true);
			}
		});
	});

	describe('package.json parsing scenarios', () => {
		test('identifies all @agentuity packages from dependencies', () => {
			const packageJson = {
				dependencies: {
					'@agentuity/core': 'latest',
					'@agentuity/server': '^1.0.0',
					react: '^18.0.0',
				},
			};

			const agentuitPackages = Object.entries(packageJson.dependencies)
				.filter(([name]) => name.startsWith('@agentuity/'))
				.map(([name, specifier]) => ({ name, specifier }));

			expect(agentuitPackages).toEqual([
				{ name: '@agentuity/core', specifier: 'latest' },
				{ name: '@agentuity/server', specifier: '^1.0.0' },
			]);
		});

		test('identifies all @agentuity packages from devDependencies', () => {
			const packageJson = {
				devDependencies: {
					'@agentuity/cli': '*',
					typescript: '^5.0.0',
				},
			};

			const agentuitPackages = Object.entries(packageJson.devDependencies)
				.filter(([name]) => name.startsWith('@agentuity/'))
				.map(([name, specifier]) => ({ name, specifier }));

			expect(agentuitPackages).toEqual([{ name: '@agentuity/cli', specifier: '*' }]);
		});

		test('combines dependencies and devDependencies', () => {
			const packageJson = {
				dependencies: {
					'@agentuity/core': 'latest',
				},
				devDependencies: {
					'@agentuity/cli': '^1.0.0',
				},
			};

			const allDeps = {
				...packageJson.dependencies,
				...packageJson.devDependencies,
			};

			const agentuitPackages = Object.entries(allDeps)
				.filter(([name]) => name.startsWith('@agentuity/'))
				.map(([name, specifier]) => ({ name, specifier }));

			expect(agentuitPackages).toEqual([
				{ name: '@agentuity/core', specifier: 'latest' },
				{ name: '@agentuity/cli', specifier: '^1.0.0' },
			]);
		});

		test('handles missing dependencies field', () => {
			const packageJson = {
				devDependencies: {
					'@agentuity/cli': 'latest',
				},
			};

			const allDeps = {
				...packageJson.dependencies,
				...packageJson.devDependencies,
			};

			const agentuitPackages = Object.entries(allDeps)
				.filter(([name]) => name.startsWith('@agentuity/'))
				.map(([name, specifier]) => ({ name, specifier }));

			expect(agentuitPackages).toEqual([{ name: '@agentuity/cli', specifier: 'latest' }]);
		});

		test('handles missing devDependencies field', () => {
			const packageJson = {
				dependencies: {
					'@agentuity/core': 'latest',
				},
			};

			const allDeps = {
				...packageJson.dependencies,
				...packageJson.devDependencies,
			};

			const agentuitPackages = Object.entries(allDeps)
				.filter(([name]) => name.startsWith('@agentuity/'))
				.map(([name, specifier]) => ({ name, specifier }));

			expect(agentuitPackages).toEqual([{ name: '@agentuity/core', specifier: 'latest' }]);
		});

		test('handles both dependencies and devDependencies missing', () => {
			const packageJson = {
				name: 'test-app',
			};

			const allDeps = {
				...packageJson.dependencies,
				...packageJson.devDependencies,
			};

			const agentuitPackages = Object.entries(allDeps)
				.filter(([name]) => name.startsWith('@agentuity/'))
				.map(([name, specifier]) => ({ name, specifier }));

			expect(agentuitPackages).toEqual([]);
		});
	});

	describe('upgrade decision logic', () => {
		test('filters packages that need upgrading', () => {
			const packages = [
				{ name: '@agentuity/core', specifier: 'latest' },
				{ name: '@agentuity/server', specifier: '1.0.0' },
				{ name: '@agentuity/cli', specifier: '^1.0.0' },
				{ name: '@agentuity/runtime', specifier: '*' },
			];

			const needsUpgrade = packages.filter(({ specifier }) => shouldUpgradeVersion(specifier));

			expect(needsUpgrade).toEqual([
				{ name: '@agentuity/core', specifier: 'latest' },
				{ name: '@agentuity/cli', specifier: '^1.0.0' },
				{ name: '@agentuity/runtime', specifier: '*' },
			]);
		});

		test('skips all packages when all are pinned', () => {
			const packages = [
				{ name: '@agentuity/core', specifier: '1.2.3' },
				{ name: '@agentuity/server', specifier: '2.0.0' },
				{ name: '@agentuity/cli', specifier: '1.5.0-beta.1' },
			];

			const needsUpgrade = packages.filter(({ specifier }) => shouldUpgradeVersion(specifier));

			expect(needsUpgrade).toEqual([]);
		});

		test('upgrades all packages when all use ranges', () => {
			const packages = [
				{ name: '@agentuity/core', specifier: '^1.0.0' },
				{ name: '@agentuity/server', specifier: '~2.0.0' },
				{ name: '@agentuity/cli', specifier: '>=1.0.0' },
			];

			const needsUpgrade = packages.filter(({ specifier }) => shouldUpgradeVersion(specifier));

			expect(needsUpgrade).toEqual(packages);
		});
	});

	describe('version comparison logic', () => {
		test('detects version mismatch between installed and CLI', () => {
			const installedVersion = '1.0.0';
			const cliVersion = '1.2.0';

			expect(installedVersion !== cliVersion).toBe(true);
		});

		test('detects version match between installed and CLI', () => {
			const installedVersion = '1.2.0';
			const cliVersion = '1.2.0';

			expect(installedVersion !== cliVersion).toBe(false);
		});

		test('handles prerelease versions', () => {
			const installedVersion = '1.0.0-alpha.1';
			const cliVersion = '1.0.0';

			expect(installedVersion !== cliVersion).toBe(true);
		});

		test('handles build metadata', () => {
			const installedVersion = '1.0.0+20130313144700';
			const cliVersion = '1.0.0';

			expect(installedVersion !== cliVersion).toBe(true);
		});
	});

	describe('specifier restoration logic', () => {
		test('maps upgraded packages to original specifiers', () => {
			const packagesToUpgrade = [
				{ name: '@agentuity/core', specifier: 'latest' },
				{ name: '@agentuity/cli', specifier: '^1.0.0' },
			];

			const upgraded = ['@agentuity/core', '@agentuity/cli'];

			const restoreMap = new Map(
				packagesToUpgrade
					.filter(({ name }) => upgraded.includes(name))
					.map(({ name, specifier }) => [name, specifier])
			);

			expect(restoreMap.get('@agentuity/core')).toBe('latest');
			expect(restoreMap.get('@agentuity/cli')).toBe('^1.0.0');
		});

		test('only restores successfully upgraded packages', () => {
			const packagesToUpgrade = [
				{ name: '@agentuity/core', specifier: 'latest' },
				{ name: '@agentuity/cli', specifier: '^1.0.0' },
				{ name: '@agentuity/server', specifier: '*' },
			];

			const upgraded = ['@agentuity/core', '@agentuity/server'];

			const restoreMap = new Map(
				packagesToUpgrade
					.filter(({ name }) => upgraded.includes(name))
					.map(({ name, specifier }) => [name, specifier])
			);

			expect(restoreMap.has('@agentuity/core')).toBe(true);
			expect(restoreMap.has('@agentuity/cli')).toBe(false);
			expect(restoreMap.has('@agentuity/server')).toBe(true);
		});

		test('preserves original specifiers after upgrade', () => {
			const originalPackageJson = {
				dependencies: {
					'@agentuity/core': 'latest',
					'@agentuity/server': '^1.0.0',
				},
			};

			// Simulate bun add changing these
			const updatedPackageJson = {
				dependencies: {
					'@agentuity/core': '1.5.0',
					'@agentuity/server': '1.5.0',
				},
			};

			// Restore original specifiers
			const specifiers = {
				'@agentuity/core': 'latest',
				'@agentuity/server': '^1.0.0',
			};

			for (const [name, specifier] of Object.entries(specifiers)) {
				if (updatedPackageJson.dependencies[name]) {
					updatedPackageJson.dependencies[name] = specifier;
				}
			}

			expect(updatedPackageJson.dependencies).toEqual(originalPackageJson.dependencies);
		});
	});

	describe('real-world scenarios', () => {
		test('typical user project with mix of versions', () => {
			const packageJson = {
				dependencies: {
					'@agentuity/core': 'latest',
					'@agentuity/server': 'latest',
					react: '^18.0.0',
					express: '^4.18.0',
				},
				devDependencies: {
					'@agentuity/cli': 'latest',
					typescript: '^5.0.0',
					'@types/react': '^18.0.0',
				},
			};

			const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
			const agentuitPackages = Object.entries(allDeps)
				.filter(([name]) => name.startsWith('@agentuity/'))
				.map(([name, specifier]) => ({ name, specifier }));

			const needsUpgrade = agentuitPackages.filter(({ specifier }) =>
				shouldUpgradeVersion(specifier)
			);

			expect(agentuitPackages.length).toBe(3);
			expect(needsUpgrade.length).toBe(3);
		});

		test('user with pinned versions (legacy project)', () => {
			const packageJson = {
				dependencies: {
					'@agentuity/core': '1.0.0',
					'@agentuity/server': '1.0.0',
				},
				devDependencies: {
					'@agentuity/cli': '1.0.0',
				},
			};

			const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
			const agentuitPackages = Object.entries(allDeps)
				.filter(([name]) => name.startsWith('@agentuity/'))
				.map(([name, specifier]) => ({ name, specifier }));

			const needsUpgrade = agentuitPackages.filter(({ specifier }) =>
				shouldUpgradeVersion(specifier)
			);

			expect(agentuitPackages.length).toBe(3);
			expect(needsUpgrade.length).toBe(0);
		});

		test('user with caret ranges (default npm behavior)', () => {
			const packageJson = {
				dependencies: {
					'@agentuity/core': '^1.0.0',
					'@agentuity/server': '^1.0.0',
				},
			};

			const agentuitPackages = Object.entries(packageJson.dependencies)
				.filter(([name]) => name.startsWith('@agentuity/'))
				.map(([name, specifier]) => ({ name, specifier }));

			const needsUpgrade = agentuitPackages.filter(({ specifier }) =>
				shouldUpgradeVersion(specifier)
			);

			expect(needsUpgrade.length).toBe(2);
		});

		test('empty project (no dependencies)', () => {
			const packageJson = {
				name: 'my-app',
				version: '1.0.0',
			};

			const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
			const agentuitPackages = Object.entries(allDeps)
				.filter(([name]) => name.startsWith('@agentuity/'))
				.map(([name, specifier]) => ({ name, specifier }));

			expect(agentuitPackages.length).toBe(0);
		});
	});
});
