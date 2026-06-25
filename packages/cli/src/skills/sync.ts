import { run, spawnInherit } from '../node-compat/proc.ts';
import { SKILLS_NPM_VERSION } from './constants.ts';

export interface RunSkillsNpmOptions {
	cwd: string;
	args?: string[];
	silent?: boolean;
}

export async function runSkillsNpm(options: RunSkillsNpmOptions): Promise<number> {
	const { cwd, args = ['--yes'], silent = false } = options;

	const local = await run({
		cwd,
		cmd: ['skills-npm', ...args],
	});

	if (local.exitCode === 0) {
		return 0;
	}

	const viaNpx = await (silent ? run : spawnInherit)({
		cwd,
		cmd: ['npx', `skills-npm@${SKILLS_NPM_VERSION}`, ...args],
	});

	return viaNpx.exitCode ?? 1;
}
