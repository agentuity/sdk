#!/usr/bin/env bun

/**
 * Build Metadata Validation Test
 * Validates agentuity.metadata.json structure, routes, agents, and assets
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const NC = '\x1b[0m';

let testsPassed = 0;
let testsFailed = 0;

function pass(message: string) {
	console.log(`${GREEN}✓ PASS:${NC} ${message}`);
	testsPassed++;
}

function fail(message: string, details?: string) {
	console.log(`${RED}✗ FAIL:${NC} ${message}`);
	if (details) {
		console.log(`  ${details}`);
	}
	testsFailed++;
}

function info(message: string) {
	console.log(`${BLUE}ℹ${NC} ${message}`);
}

async function main() {
	console.log('=========================================');
	console.log('  Build Metadata Validation Test');
	console.log('=========================================');
	console.log('');

	// Import BuildMetadataSchema
	const scriptDir = __dirname;
	const projectRoot = resolve(scriptDir, '../../../..');
	const typesPath = join(projectRoot, 'packages/server');
	const { BuildMetadataSchema } = await import(typesPath);

	const projectDir = join(scriptDir, '..');
	const metadataPath = join(projectDir, '.agentuity', 'agentuity.metadata.json');

	// Rebuild in production mode to ensure routes are parsed
	info('Rebuilding in production mode...');
	const cliPath = join(projectRoot, 'packages/cli/bin/cli.ts');
	const buildResult = await Bun.spawn(['bun', cliPath, 'bundle', '--dir', projectDir], {
		stdout: 'pipe',
		stderr: 'pipe',
	});

	await buildResult.exited;

	if (buildResult.exitCode !== 0) {
		const buildOutput = await new Response(buildResult.stdout).text();
		const buildError = await new Response(buildResult.stderr).text();
		console.error('Build failed:');
		console.error(buildError || buildOutput);
		fail('Production build failed');
		process.exit(1);
	}
	pass('Production build completed');
	console.log('');

	// Check if metadata file exists
	if (!existsSync(metadataPath)) {
		fail('Metadata file does not exist', `Expected: ${metadataPath}`);
		console.log('');
		console.log('Run: bun run build');
		process.exit(1);
	}
	pass('Metadata file exists');

	// Load metadata
	const metadataFile = Bun.file(metadataPath);
	const metadataJson = await metadataFile.json();

	info(`Loaded metadata from: ${metadataPath}`);
	console.log('');

	// Test 1: Validate against Zod schema
	console.log('Test 1: Schema Validation');
	console.log('---');
	try {
		const result = BuildMetadataSchema.safeParse(metadataJson);
		if (result.success) {
			pass('Metadata matches BuildMetadataSchema');
		} else {
			fail('Metadata schema validation failed');
			console.log('Validation errors:');
			result.error.errors.forEach((err) => {
				console.log(`  - ${err.path.join('.')}: ${err.message}`);
			});
		}
	} catch (error) {
		fail('Schema validation threw error', error instanceof Error ? error.message : String(error));
	}
	console.log('');

	// Test 2: Validate Routes
	console.log('Test 2: Routes Validation');
	console.log('---');
	const routes = metadataJson.routes || [];
	info(`Total routes: ${routes.length}`);

	// Check for team routes
	const teamRoutes = routes.filter((r: any) => r.path?.startsWith('/agent/team'));
	if (teamRoutes.length >= 10) {
		pass(`Team routes found: ${teamRoutes.length}`);
	} else {
		fail(`Expected at least 10 team routes, found: ${teamRoutes.length}`);
	}

	// Validate subagent routes are flat (not nested)
	const teamMembersRoutes = routes.filter((r: any) => r.path?.startsWith('/agent/team/members'));
	const teamTasksRoutes = routes.filter((r: any) => r.path?.startsWith('/agent/team/tasks'));

	if (teamMembersRoutes.length >= 4) {
		pass(`Team members subagent routes found: ${teamMembersRoutes.length}`);
		teamMembersRoutes.forEach((r: any) => {
			info(`  ${r.method.toUpperCase()} ${r.path}`);
		});
	} else {
		fail(`Expected at least 4 members routes, found: ${teamMembersRoutes.length}`);
	}

	if (teamTasksRoutes.length >= 4) {
		pass(`Team tasks subagent routes found: ${teamTasksRoutes.length}`);
		teamTasksRoutes.forEach((r: any) => {
			info(`  ${r.method.toUpperCase()} ${r.path}`);
		});
	} else {
		fail(`Expected at least 4 tasks routes, found: ${teamTasksRoutes.length}`);
	}

	// Validate route structure
	const invalidRoutes = routes.filter((r: any) => {
		return !r.id || !r.method || !r.path || !r.version || !r.filename || !r.type;
	});
	if (invalidRoutes.length === 0) {
		pass('All routes have required fields');
	} else {
		fail(`${invalidRoutes.length} routes missing required fields`);
	}
	console.log('');

	// Test 3: Validate Agents
	console.log('Test 3: Agents Validation');
	console.log('---');
	const agents = metadataJson.agents || [];
	info(`Total agents: ${agents.length}`);

	// Find team agent
	const teamAgent = agents.find((a: any) => a.identifier === 'team');
	if (teamAgent) {
		pass('Team agent found');

		// Validate team agent has subagents
		if (teamAgent.subagents && Array.isArray(teamAgent.subagents)) {
			pass(`Team agent has subagents array: ${teamAgent.subagents.length} subagents`);

			// Validate subagent structure
			const memberSubagent = teamAgent.subagents.find((s: any) => s.identifier === 'members');
			const tasksSubagent = teamAgent.subagents.find((s: any) => s.identifier === 'tasks');

			if (memberSubagent) {
				pass('Members subagent found in team.subagents');
				info(`  ID: ${memberSubagent.id}`);
				info(`  Filename: ${memberSubagent.filename}`);
				info(`  Version: ${memberSubagent.version.substring(0, 12)}...`);

				// Validate subagent has required fields
				if (
					memberSubagent.id &&
					memberSubagent.filename &&
					memberSubagent.name &&
					memberSubagent.version &&
					memberSubagent.identifier
				) {
					pass('Members subagent has all required fields');
				} else {
					fail('Members subagent missing required fields');
				}
			} else {
				fail('Members subagent not found in team.subagents');
			}

			if (tasksSubagent) {
				pass('Tasks subagent found in team.subagents');
				info(`  ID: ${tasksSubagent.id}`);
				info(`  Filename: ${tasksSubagent.filename}`);
				info(`  Version: ${tasksSubagent.version.substring(0, 12)}...`);

				// Validate subagent has required fields
				if (
					tasksSubagent.id &&
					tasksSubagent.filename &&
					tasksSubagent.name &&
					tasksSubagent.version &&
					tasksSubagent.identifier
				) {
					pass('Tasks subagent has all required fields');
				} else {
					fail('Tasks subagent missing required fields');
				}

				// Validate subagent does NOT have its own subagents property
				if (!tasksSubagent.subagents) {
					pass('Subagent does not have nested subagents (correct)');
				} else {
					fail('Subagent should not have subagents property');
				}
			} else {
				fail('Tasks subagent not found in team.subagents');
			}
		} else {
			fail('Team agent missing subagents array');
		}

		// Validate team agent has required fields
		if (
			teamAgent.id &&
			teamAgent.filename &&
			teamAgent.name &&
			teamAgent.version &&
			teamAgent.identifier
		) {
			pass('Team agent has all required fields');
		} else {
			fail('Team agent missing required fields');
		}
	} else {
		fail('Team agent not found');
	}

	// Validate no standalone members/tasks agents in top level
	const standaloneMembers = agents.find((a: any) => a.identifier === 'members' && !a.parent);
	const standaloneTasks = agents.find((a: any) => a.identifier === 'tasks' && !a.parent);

	if (!standaloneMembers && !standaloneTasks) {
		pass('Subagents not duplicated in top-level agents array');
	} else {
		fail('Subagents should only appear nested, not in top-level array');
	}
	console.log('');

	// Test 4: Validate Assets
	console.log('Test 4: Assets Validation');
	console.log('---');
	const assets = metadataJson.assets || [];
	info(`Total assets: ${assets.length}`);

	if (assets.length > 0) {
		pass(`Assets found: ${assets.length}`);

		// Validate asset structure
		const invalidAssets = assets.filter((a: any) => {
			return !a.filename || !a.kind || !a.contentType || typeof a.size !== 'number';
		});
		if (invalidAssets.length === 0) {
			pass('All assets have required fields');
		} else {
			fail(`${invalidAssets.length} assets missing required fields`);
		}
	} else {
		info('No assets in build (web/ folder may be empty)');
	}
	console.log('');

	// Test 5: Validate Project Metadata
	console.log('Test 5: Project Metadata');
	console.log('---');
	const project = metadataJson.project;
	if (project) {
		if (project.name) {
			pass('Project metadata present');
			info(`  Name: ${project.name}`);
			info(`  Version: ${project.version || 'N/A'}`);
			info(`  ID: ${project.id || '(empty - dev build)'}`);
		} else {
			fail('Project metadata incomplete');
		}
	} else {
		fail('Project metadata missing');
	}
	console.log('');

	// Test 6: Validate Deployment Metadata
	console.log('Test 6: Deployment Metadata');
	console.log('---');
	const deployment = metadataJson.deployment;
	if (deployment) {
		if (deployment.build && deployment.date) {
			pass('Deployment metadata present');
			info(`  Bun version: ${deployment.build.bun}`);
			info(`  Platform: ${deployment.build.platform}`);
			info(`  Arch: ${deployment.build.arch}`);
		} else {
			fail('Deployment metadata incomplete');
		}
	} else {
		fail('Deployment metadata missing');
	}
	console.log('');

	// Summary
	console.log('=========================================');
	console.log('  Build Metadata Validation Summary');
	console.log('=========================================');
	console.log(`Total Tests:  ${testsPassed + testsFailed}`);
	console.log(`${GREEN}Passed:       ${testsPassed}${NC}`);
	if (testsFailed > 0) {
		console.log(`${RED}Failed:       ${testsFailed}${NC}`);
	} else {
		console.log(`Failed:       ${testsFailed}`);
	}
	console.log('=========================================');
	console.log('');

	if (testsFailed > 0) {
		console.log(`${RED}Some validation tests failed!${NC}`);
		process.exit(1);
	} else {
		console.log(`${GREEN}All validation tests passed!${NC}`);
		process.exit(0);
	}
}

main().catch((error) => {
	console.error(`${RED}Fatal error:${NC}`, error);
	process.exit(1);
});
