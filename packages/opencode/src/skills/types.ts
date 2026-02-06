/**
 * Skill scope determines where the skill was loaded from
 * Priority order: project > user > opencode
 */
export type SkillScope = 'project' | 'user' | 'opencode';

/**
 * Frontmatter metadata parsed from skill files
 */
export interface SkillMetadata {
	name?: string;
	description?: string;
	model?: string;
	agent?: string;
	subtask?: boolean;
	'argument-hint'?: string;
	'allowed-tools'?: string | string[];
	license?: string;
	compatibility?: string;
	metadata?: Record<string, string>;
}

/**
 * A loaded skill ready for use
 */
export interface LoadedSkill {
	name: string;
	path: string;
	resolvedPath: string;
	content: string;
	metadata: SkillMetadata;
	scope: SkillScope;
	allowedTools?: string[];
}

/**
 * Configuration for skills loading
 */
export interface SkillsConfig {
	enabled: boolean;
	paths?: string[];
	disabled?: string[];
}
