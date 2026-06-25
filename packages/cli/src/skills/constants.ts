export const SKILLS_NPM_VERSION = '1.2.0';
export const SKILLS_PACKAGE = '@agentuity/skills';
export const SKILLS_NPM_PREPARE_COMMAND = 'skills-npm --yes';
export const SKILLS_NPM_CONFIG_FILE = 'skills-npm.config.ts';

export const SKILLS_GITIGNORE_ENTRIES = [
	'.agents/skills/npm-*',
	'.cursor/skills/npm-*',
	'.claude/skills/npm-*',
	'.opencode/skills/npm-*',
] as const;

export const SKILLS_NPM_CONFIG_CONTENT = `import { defineConfig } from 'skills-npm';

export default defineConfig({
\tinclude: ['${SKILLS_PACKAGE}'],
});
`;
