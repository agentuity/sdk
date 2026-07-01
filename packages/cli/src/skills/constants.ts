import { homedir } from 'node:os';
import { join } from 'node:path';

export const SKILLS_NPM_VERSION = '1.2.0';
export const SKILLS_CLI_VERSION = '1.5.13';
export const SKILLS_PACKAGE = '@agentuity/skills';
export const SKILLS_GIT_SOURCE = 'agentuity/sdk/skills';
/** skills CLI agent whose global dir is ~/.agents/skills */
export const SKILLS_GLOBAL_AGENT = 'cline';

export function getGlobalSkillsDir(): string {
	return join(homedir(), '.agents', 'skills');
}
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
