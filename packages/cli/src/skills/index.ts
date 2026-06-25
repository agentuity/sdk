export {
	SKILLS_GITIGNORE_ENTRIES,
	SKILLS_NPM_CONFIG_FILE,
	SKILLS_NPM_PREPARE_COMMAND,
	SKILLS_NPM_VERSION,
	SKILLS_PACKAGE,
} from './constants.ts';
export {
	appendSkillsGitignore,
	isSkillsConfigured,
	listBundledSkills,
	mergePrepareScript,
	wireSkillsToProject,
	type BundledSkillInfo,
	type WireSkillsOptions,
	type WireSkillsResult,
} from './setup.ts';
export { runSkillsNpm, type RunSkillsNpmOptions } from './sync.ts';
