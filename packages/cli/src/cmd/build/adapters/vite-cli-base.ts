/**
 * Inject Vite CLI `--base` into a shell build command.
 *
 * Appends `--base=<cdnBase>` only to the segment that invokes `vite`, so
 * compound commands like `tsc -b && vite build && echo done` stay correct.
 */

/**
 * Append `--base=<cdnBase>` to the shell segment that invokes vite.
 * Leaves other compound-command segments (before/after `&&` / `||` / `;`) unchanged.
 * No-op when vite is not on the command line or that segment already has `--base`.
 */
export function injectViteBaseFlag(buildCommand: string, cdnBase: string): string {
	const trimmed = buildCommand.trim();
	if (!trimmed) return buildCommand;
	if (!/\bvite\b/.test(trimmed)) return buildCommand;

	// Split on shell separators while retaining them in the result.
	const parts = trimmed.split(/(\s*(?:&&|\|\||;)\s*)/);
	let changed = false;
	const out = parts.map((part) => {
		// Separator tokens (&&, ||, ;)
		if (/^\s*(?:&&|\|\||;)\s*$/.test(part)) return part;
		if (!/\bvite\b/.test(part)) return part;
		if (/(?:^|\s)--base(?:=|\s|$)/.test(part)) return part;
		changed = true;
		return `${part.trimEnd()} --base=${cdnBase}`;
	});

	return changed ? out.join('') : buildCommand;
}
