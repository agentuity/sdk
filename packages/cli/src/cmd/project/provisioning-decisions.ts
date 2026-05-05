/**
 * Pure decision helpers for the cloud-provisioning step in
 * `runCreateFlow`. Pulled out of `template-flow.ts` so the rules for
 * "should we prompt about a database here?" can be unit-tested without
 * standing up a full prompt/auth/api-client harness.
 */

/**
 * One of:
 *   - undefined   \u2014 no CLI flag passed; defer to other signals.
 *   - 'Skip'      \u2014 user explicitly opted out.
 *   - 'Create New'\u2014 user explicitly opted in to a fresh resource.
 *   - any other string \u2014 user named an existing resource to reuse.
 */
export type FlagAction = undefined | 'Skip' | 'Create New' | string;

/**
 * Normalize a CLI flag value (`--database` / `--storage`) into the same
 * action vocabulary the interactive flow uses. The existence check for
 * named resources happens later, after the resource list is fetched.
 */
export function resolveFlagAction(flag: string | undefined): FlagAction {
	if (flag === undefined) return undefined;
	const lower = flag.toLowerCase();
	if (lower === 'new') return 'Create New';
	if (lower === 'skip') return 'Skip';
	return flag;
}

/**
 * Combine three signals \u2014 the flag, whether the user picked the
 * matching service, and whether we're authenticated \u2014 into a single
 * yes/no for "should we prompt about this resource?"
 *
 * Rules, in order:
 *   1. Flag set to 'skip'         \u2192 false (explicit opt-out wins).
 *   2. Flag set to anything else  \u2192 true (explicit opt-in).
 *   3. Service in selection       \u2192 true (multi-select opt-in).
 *   4. Otherwise                  \u2192 false.
 */
export function shouldPromptForResource(opts: {
	flagAction: FlagAction;
	inServiceSelection: boolean;
}): boolean {
	if (opts.flagAction === 'Skip') return false;
	if (opts.flagAction !== undefined) return true;
	return opts.inServiceSelection;
}

/**
 * True when the caller passed `--database` or `--storage` with a value
 * that requests provisioning (i.e. anything other than 'skip'). Used to
 * gate the "you must be authenticated" fatal error: service selection
 * alone never triggers it because scaffolds work fine offline.
 */
export function flagRequiresProvisioning(flag: string | undefined): boolean {
	if (flag === undefined) return false;
	return flag.toLowerCase() !== 'skip';
}
