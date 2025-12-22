import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { semver } from 'bun';
import type { Logger } from '@agentuity/core';

const SKILLS_DIR = '.agents/skills/agentuity/cli';
const VERSION_FILE = 'version.txt';

interface SkillsCheckResult {
	needsRegeneration: boolean;
	reason?: 'missing' | 'outdated' | 'version-missing';
	currentVersion?: string;
}

export async function checkSkillsVersion(
	projectDir: string,
	cliVersion: string
): Promise<SkillsCheckResult> {
	const skillsDir = join(projectDir, SKILLS_DIR);
	const versionFile = join(skillsDir, VERSION_FILE);

	if (!existsSync(skillsDir)) {
		return { needsRegeneration: true, reason: 'missing' };
	}

	if (!existsSync(versionFile)) {
		return { needsRegeneration: true, reason: 'version-missing' };
	}

	const currentVersion = (await Bun.file(versionFile).text()).trim();
	if (!currentVersion) {
		return { needsRegeneration: true, reason: 'version-missing' };
	}

	try {
		const order = semver.order(currentVersion, cliVersion);
		if (order < 0) {
			return { needsRegeneration: true, reason: 'outdated', currentVersion };
		}
	} catch {
		return { needsRegeneration: true, reason: 'outdated', currentVersion };
	}

	return { needsRegeneration: false, currentVersion };
}

export async function regenerateSkillsAsync(
	projectDir: string,
	cliVersion: string,
	logger: Logger
): Promise<void> {
	const result = await checkSkillsVersion(projectDir, cliVersion);

	if (!result.needsRegeneration) {
		return;
	}

	const reasonMsg =
		result.reason === 'missing'
			? 'Skills not found'
			: result.reason === 'version-missing'
				? 'Skills version unknown'
				: `Skills outdated (${result.currentVersion} < ${cliVersion})`;

	logger.debug(`${reasonMsg}, regenerating...`);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const schema = (global as any).__CLI_SCHEMA__;
	if (!schema) {
		logger.debug('CLI schema not available, skipping skill regeneration');
		return;
	}

	try {
		const outputDir = join(projectDir, '.agents');
		const { generateSkills } = await import('../ai/skills/generator');
		await generateSkills(schema, outputDir, false);
		logger.debug(`Skills regenerated to ${outputDir}/skills/agentuity/cli`);
	} catch (error) {
		logger.debug(`Failed to regenerate skills: ${error}`);
	}
}
