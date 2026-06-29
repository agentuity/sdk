import { run, spawnInherit } from '../node-compat/proc.ts';
import { SKILLS_CLI_VERSION, SKILLS_GIT_SOURCE, SKILLS_GLOBAL_AGENT } from './constants.ts';

export interface RunSkillsAddOptions {
	cwd: string;
	global?: boolean;
	args?: string[];
	silent?: boolean;
}

export function buildSkillsAddArgs(
	options: Pick<RunSkillsAddOptions, 'global' | 'args'> = {}
): string[] {
	const args = ['add', SKILLS_GIT_SOURCE, '--yes', ...(options.args ?? [])];
	if (options.global) {
		args.push('--global', '--agent', SKILLS_GLOBAL_AGENT);
	}
	return args;
}

export async function runSkillsAdd(options: RunSkillsAddOptions): Promise<number> {
	const { cwd, global = false, args, silent = false } = options;
	const addArgs = buildSkillsAddArgs({ global, args });

	const local = await run({
		cwd,
		cmd: ['skills', ...addArgs],
	});

	if (local.exitCode === 0) {
		return 0;
	}

	const viaNpx = await (silent ? run : spawnInherit)({
		cwd,
		cmd: ['npx', `skills@${SKILLS_CLI_VERSION}`, ...addArgs],
	});

	return viaNpx.exitCode ?? 1;
}
