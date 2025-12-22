import type { CLISchema, SchemaCommand, SchemaOption, SchemaArgument } from '../../../schema-generator';
import * as path from 'node:path';

interface SkillInfo {
	skillPath: string;
	skillName: string;
	command: SchemaCommand;
	fullCommandPath: string[];
}

const EXCLUDED_COMMANDS = new Set(['ai', 'help', 'version']);

function isValidSkillName(name: string): boolean {
	if (name.length < 1 || name.length > 64) return false;
	if (!/^[a-z0-9-]+$/.test(name)) return false;
	if (name.startsWith('-') || name.endsWith('-')) return false;
	if (name.includes('--')) return false;
	return true;
}

function toSkillName(parts: string[]): string {
	return parts.join('-').toLowerCase();
}

function enhanceDescription(command: SchemaCommand, fullPath: string[]): string {
	let description = command.description;

	const context = getCommandContext(command, fullPath);
	if (context) {
		description = `${description}. ${context}`;
	}

	if (description.length > 1024) {
		description = description.substring(0, 1021) + '...';
	}

	return description;
}

function getCommandContext(command: SchemaCommand, fullPath: string[]): string {
	const parts: string[] = [];

	if (command.requires?.auth) {
		parts.push('Requires authentication');
	}

	if (fullPath.includes('cloud')) {
		parts.push('Use for Agentuity cloud platform operations');
	} else if (fullPath.includes('auth')) {
		parts.push('Use for managing authentication credentials');
	} else if (fullPath.includes('project')) {
		parts.push('Use for project management operations');
	}

	return parts.join('. ');
}

function collectLeafCommands(
	command: SchemaCommand,
	parentPath: string[],
	baseDir: string,
	_isHidden: boolean
): SkillInfo[] {
	const skills: SkillInfo[] = [];
	const currentPath = [...parentPath, command.name];

	if (command.subcommands && command.subcommands.length > 0) {
		for (const sub of command.subcommands) {
			skills.push(...collectLeafCommands(sub, currentPath, baseDir, _isHidden));
		}
	} else {
		const skillName = `agentuity-cli-${toSkillName(currentPath)}`;

		if (!isValidSkillName(skillName)) {
			return skills;
		}

		const skillPath = path.join(baseDir, skillName, 'SKILL.md');

		skills.push({
			skillPath,
			skillName,
			command,
			fullCommandPath: currentPath,
		});
	}

	return skills;
}

function formatPrerequisites(command: SchemaCommand): string[] {
	const prereqs: string[] = [];

	if (command.requires?.auth) {
		prereqs.push('Authenticated with `agentuity auth login`');
	}

	if (command.requires?.project) {
		prereqs.push('Project context required (run from project directory or use `--project-id`)');
	}

	if (command.requires?.org) {
		prereqs.push('Organization context required (`--org-id` or default org)');
	}

	if (command.prerequisites) {
		prereqs.push(...command.prerequisites);
	}

	return prereqs;
}

function formatOptionsTable(options: SchemaOption[]): string {
	if (options.length === 0) return '';

	const lines: string[] = [
		'| Option | Type | Required | Default | Description |',
		'|--------|------|----------|---------|-------------|',
	];

	for (const opt of options) {
		const optName = `\`--${opt.name}\``;
		const optType = opt.enum ? opt.enum.join(' \\| ') : opt.type;
		const required = opt.required ? 'Yes' : 'No';
		const defaultVal = opt.default !== undefined ? `\`${JSON.stringify(opt.default)}\`` : '-';
		const desc = opt.description ?? '-';

		lines.push(`| ${optName} | ${optType} | ${required} | ${defaultVal} | ${desc} |`);
	}

	return lines.join('\n');
}

function formatArgumentsTable(args: SchemaArgument[]): string {
	if (args.length === 0) return '';

	const lines: string[] = [
		'| Argument | Type | Required | Description |',
		'|----------|------|----------|-------------|',
	];

	for (const arg of args) {
		const argName = `\`<${arg.name}${arg.variadic ? '...' : ''}>\``;
		const argType = arg.variadic ? 'array' : arg.type;
		const required = arg.required ? 'Yes' : 'No';
		const desc = arg.description ?? '-';

		lines.push(`| ${argName} | ${argType} | ${required} | ${desc} |`);
	}

	return lines.join('\n');
}

function formatExamples(command: SchemaCommand): string {
	if (!command.examples || command.examples.length === 0) {
		return '';
	}

	const lines: string[] = [];

	for (const example of command.examples) {
		lines.push(`${example.description}:`);
		lines.push('');
		lines.push('```bash');
		lines.push(example.command);
		lines.push('```');
		lines.push('');
	}

	return lines.join('\n').trim();
}

function formatResponse(command: SchemaCommand): string {
	if (!command.response) {
		return '';
	}

	const response = command.response as Record<string, unknown>;
	const lines: string[] = [];

	if (response.type === 'object' && response.properties) {
		const props = response.properties as Record<string, { type?: string; description?: string }>;

		lines.push('Returns JSON object:');
		lines.push('');
		lines.push('```json');
		const sample: Record<string, string> = {};
		for (const [key, val] of Object.entries(props)) {
			sample[key] = val.type ?? 'unknown';
		}
		lines.push(JSON.stringify(sample, null, 2));
		lines.push('```');
		lines.push('');
		lines.push('| Field | Type | Description |');
		lines.push('|-------|------|-------------|');

		for (const [key, val] of Object.entries(props)) {
			lines.push(`| \`${key}\` | ${val.type ?? 'unknown'} | ${val.description ?? '-'} |`);
		}
	} else if (response.type) {
		lines.push(`Returns: \`${response.type}\``);
	}

	return lines.join('\n');
}

function buildUsageString(command: SchemaCommand, fullPath: string[]): string {
	const parts = ['agentuity', ...fullPath];

	if (command.arguments) {
		for (const arg of command.arguments) {
			const argStr = arg.required
				? `<${arg.name}${arg.variadic ? '...' : ''}>`
				: `[${arg.name}${arg.variadic ? '...' : ''}]`;
			parts.push(argStr);
		}
	}

	if (command.options && command.options.length > 0) {
		parts.push('[options]');
	}

	return parts.join(' ');
}

function escapeYamlString(str: string): string {
	if (/[:[\]{}#&*!|>'"%@`]/.test(str) || str.includes('\n')) {
		return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
	}
	return str;
}

function buildArgumentHint(command: SchemaCommand): string | null {
	if (!command.arguments || command.arguments.length === 0) {
		return null;
	}

	const hints = command.arguments.map((arg) => {
		const name = arg.variadic ? `${arg.name}...` : arg.name;
		return arg.required ? `<${name}>` : `[${name}]`;
	});

	return hints.join(' ');
}

function generateSkillContent(skill: SkillInfo, version: string): string {
	const { command, skillName, fullCommandPath } = skill;
	const fullCommand = ['agentuity', ...fullCommandPath].join(' ');

	const enhancedDescription = enhanceDescription(command, fullCommandPath);
	const tags = command.tags?.join(' ') ?? '';
	const argumentHint = buildArgumentHint(command);

	const lines: string[] = [
		'---',
		`name: ${skillName}`,
		`description: ${escapeYamlString(enhancedDescription)}`,
		`version: "${version}"`,
		'license: Apache-2.0',
		`allowed-tools: "Bash(agentuity:*)"`,
	];

	if (argumentHint) {
		lines.push(`argument-hint: "${argumentHint}"`);
	}

	lines.push('metadata:');
	lines.push(`  command: "${fullCommand}"`);

	if (tags) {
		lines.push(`  tags: "${tags}"`);
	}

	lines.push('---');
	lines.push('');

	const title = fullCommandPath
		.map((p) => p.charAt(0).toUpperCase() + p.slice(1))
		.join(' ');
	lines.push(`# ${title}`);
	lines.push('');
	lines.push(command.description);
	lines.push('');

	const prerequisites = formatPrerequisites(command);
	if (prerequisites.length > 0) {
		lines.push('## Prerequisites');
		lines.push('');
		for (const prereq of prerequisites) {
			lines.push(`- ${prereq}`);
		}
		lines.push('');
	}

	lines.push('## Usage');
	lines.push('');
	lines.push('```bash');
	lines.push(buildUsageString(command, fullCommandPath));
	lines.push('```');
	lines.push('');

	if (command.arguments && command.arguments.length > 0) {
		lines.push('## Arguments');
		lines.push('');
		lines.push(formatArgumentsTable(command.arguments));
		lines.push('');
	}

	if (command.options && command.options.length > 0) {
		lines.push('## Options');
		lines.push('');
		lines.push(formatOptionsTable(command.options));
		lines.push('');
	}

	const examples = formatExamples(command);
	if (examples) {
		lines.push('## Examples');
		lines.push('');
		lines.push(examples);
		lines.push('');
	}

	const response = formatResponse(command);
	if (response) {
		lines.push('## Output');
		lines.push('');
		lines.push(response);
		lines.push('');
	}

	return lines.join('\n');
}

function generateReadme(version: string, skills: SkillInfo[]): string {
	const groups = new Map<string, SkillInfo[]>();
	for (const skill of skills) {
		const group = skill.fullCommandPath[0];
		if (!groups.has(group)) {
			groups.set(group, []);
		}
		groups.get(group)!.push(skill);
	}

	const lines: string[] = [
		'# Agentuity CLI Skills',
		'',
		'This directory contains auto-generated [Agent Skills](https://agentskills.io) for the Agentuity CLI.',
		'',
		'## What are Agent Skills?',
		'',
		'Agent Skills are modular capabilities that extend AI coding agents. Each skill is a directory',
		'containing a `SKILL.md` file with instructions that agents read when performing relevant tasks.',
		'',
		'Learn more at the [Agent Skills Specification](https://agentskills.io/specification).',
		'',
		'## Generated From',
		'',
		`- **CLI Version**: ${version}`,
		`- **Generated**: ${new Date().toISOString().split('T')[0]}`,
		`- **Total Skills**: ${skills.length}`,
		'',
		'## Available Skills',
		'',
	];

	for (const [group, groupSkills] of [...groups.entries()].sort()) {
		lines.push(`### ${group}`);
		lines.push('');
		lines.push('| Skill | Command | Description |');
		lines.push('|-------|---------|-------------|');

		for (const skill of groupSkills.sort((a, b) => a.skillName.localeCompare(b.skillName))) {
			const cmd = `\`agentuity ${skill.fullCommandPath.join(' ')}\``;
			const desc = skill.command.description.substring(0, 60) + (skill.command.description.length > 60 ? '...' : '');
			lines.push(`| [${skill.skillName}](./${skill.skillName}) | ${cmd} | ${desc} |`);
		}

		lines.push('');
	}

	lines.push('## Usage');
	lines.push('');
	lines.push('These skills are designed for AI coding agents that support the Agent Skills format.');
	lines.push('Place this directory in your project or install globally for your agent to discover.');
	lines.push('');
	lines.push('## Regenerating');
	lines.push('');
	lines.push('To regenerate these skills with the latest CLI schema:');
	lines.push('');
	lines.push('```bash');
	lines.push('agentuity ai skills generate --output ./skills');
	lines.push('```');
	lines.push('');
	lines.push('---');
	lines.push('');
	lines.push('*This file was auto-generated by the Agentuity CLI. Do not edit manually.*');
	lines.push('');

	return lines.join('\n');
}

export function collectSkillsForPreview(
	schema: CLISchema,
	outputDir: string,
	includeHidden: boolean
): string[] {
	const baseDir = path.join(outputDir, 'skills');
	const allSkills: SkillInfo[] = [];

	for (const command of schema.commands) {
		if (EXCLUDED_COMMANDS.has(command.name)) {
			continue;
		}

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const isHidden = (command as any).hidden === true;
		if (isHidden && !includeHidden) {
			continue;
		}

		const skills = collectLeafCommands(command, [], baseDir, isHidden);
		allSkills.push(...skills);
	}

	return allSkills.map((s) => s.skillPath);
}

export async function generateSkills(
	schema: CLISchema,
	outputDir: string,
	includeHidden: boolean
): Promise<number> {
	const baseDir = path.join(outputDir, 'skills');
	const allSkills: SkillInfo[] = [];

	for (const command of schema.commands) {
		if (EXCLUDED_COMMANDS.has(command.name)) {
			continue;
		}

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const isHidden = (command as any).hidden === true;
		if (isHidden && !includeHidden) {
			continue;
		}

		const skills = collectLeafCommands(command, [], baseDir, isHidden);
		allSkills.push(...skills);
	}

	if (allSkills.length === 0) {
		return 0;
	}

	let created = 0;
	for (const skill of allSkills) {
		const content = generateSkillContent(skill, schema.version);
		const skillDir = path.dirname(skill.skillPath);

		await Bun.$`mkdir -p ${skillDir}`.quiet();
		await Bun.write(Bun.file(skill.skillPath), content);
		created++;
	}

	const readmePath = path.join(baseDir, 'README.md');
	const readmeContent = generateReadme(schema.version, allSkills);
	await Bun.write(Bun.file(readmePath), readmeContent);

	const versionPath = path.join(baseDir, 'version.txt');
	await Bun.write(Bun.file(versionPath), schema.version);

	return created;
}
