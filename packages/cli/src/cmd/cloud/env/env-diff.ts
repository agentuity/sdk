import * as tui from '../../../tui.ts';
import { maskSecret } from '../../../env-util.ts';

export interface EnvDiffEntry {
	key: string;
	/** The value from the "source" side (the side being pushed/pulled from) */
	sourceValue: string;
	/** The value from the "target" side (the side being overwritten), undefined if new */
	targetValue?: string;
	/** Whether the source side stores this as a secret */
	sourceIsSecret: boolean;
	/** Whether the target side stores this as a secret (undefined if new, i.e. no target) */
	targetIsSecret?: boolean;
}

export interface EnvDiff {
	newEntries: EnvDiffEntry[];
	changedEntries: EnvDiffEntry[];
	unchangedEntries: EnvDiffEntry[];
}

/**
 * Compute diff between source and target env/secrets.
 * "Source" is where values come from; "target" is what will be overwritten.
 *
 * For push: source=local, target=remote
 * For pull: source=cloud, target=local
 */
export function computeEnvDiff(
	sourceEnv: Record<string, string>,
	sourceSecrets: Record<string, string>,
	targetEnv: Record<string, string>,
	targetSecrets: Record<string, string>
): EnvDiff {
	const newEntries: EnvDiffEntry[] = [];
	const changedEntries: EnvDiffEntry[] = [];
	const unchangedEntries: EnvDiffEntry[] = [];

	// Check env vars
	for (const key of Object.keys(sourceEnv)) {
		const sourceValue = sourceEnv[key]!;
		if (key in targetEnv) {
			if (sourceValue === targetEnv[key]) {
				unchangedEntries.push({
					key,
					sourceValue,
					targetValue: targetEnv[key],
					sourceIsSecret: false,
					targetIsSecret: false,
				});
			} else {
				changedEntries.push({
					key,
					sourceValue,
					targetValue: targetEnv[key],
					sourceIsSecret: false,
					targetIsSecret: false,
				});
			}
		} else if (key in targetSecrets) {
			// Key exists but as a different type - treat as changed
			changedEntries.push({
				key,
				sourceValue,
				targetValue: targetSecrets[key],
				sourceIsSecret: false,
				targetIsSecret: true,
			});
		} else {
			newEntries.push({ key, sourceValue, sourceIsSecret: false });
		}
	}

	// Check secrets
	for (const key of Object.keys(sourceSecrets)) {
		const sourceValue = sourceSecrets[key]!;
		if (key in targetSecrets) {
			if (sourceValue === targetSecrets[key]) {
				unchangedEntries.push({
					key,
					sourceValue,
					targetValue: targetSecrets[key],
					sourceIsSecret: true,
					targetIsSecret: true,
				});
			} else {
				changedEntries.push({
					key,
					sourceValue,
					targetValue: targetSecrets[key],
					sourceIsSecret: true,
					targetIsSecret: true,
				});
			}
		} else if (key in targetEnv) {
			// Key exists but as a different type - treat as changed
			changedEntries.push({
				key,
				sourceValue,
				targetValue: targetEnv[key],
				sourceIsSecret: true,
				targetIsSecret: false,
			});
		} else {
			newEntries.push({ key, sourceValue, sourceIsSecret: true });
		}
	}

	return { newEntries, changedEntries, unchangedEntries };
}

function displayValue(value: string, isSecret: boolean): string {
	return isSecret ? maskSecret(value) : value;
}

export interface DisplayEnvDiffOptions {
	/** Label for the operation, shown in header. E.g. "push" or "pull" */
	direction: 'push' | 'pull';
}

/**
 * Display a diff view of env changes.
 * In TTY mode, shows a rich color-coded diff.
 * In non-TTY mode, shows simple text summary.
 */
export function displayEnvDiff(diff: EnvDiff, options: DisplayEnvDiffOptions): void {
	const { direction } = options;

	// Non-TTY: simple summary
	if (!tui.isTTYLike()) {
		if (diff.newEntries.length > 0) {
			tui.info(
				`New variables: ${diff.newEntries.length} (${diff.newEntries.map((e) => e.key).join(', ')})`
			);
		}
		if (diff.changedEntries.length > 0) {
			const verb = direction === 'push' ? 'overwritten remotely' : 'overwritten locally';
			tui.warning(
				`Variables that will be ${verb}: ${diff.changedEntries.length} (${diff.changedEntries.map((e) => e.key).join(', ')})`
			);
		}
		if (diff.unchangedEntries.length > 0) {
			tui.info(`Unchanged variables: ${diff.unchangedEntries.length}`);
		}
		return;
	}

	// TTY: rich diff view
	tui.newline();
	tui.info('Environment variable changes:');
	tui.newline();

	// Sort all entries by key for consistent display
	const allEntries = [
		...diff.newEntries.map((e) => ({ ...e, status: 'new' as const })),
		...diff.changedEntries.map((e) => ({ ...e, status: 'changed' as const })),
		...diff.unchangedEntries.map((e) => ({ ...e, status: 'unchanged' as const })),
	].sort((a, b) => a.key.localeCompare(b.key));

	for (const entry of allEntries) {
		const typeLabel = entry.sourceIsSecret ? 'secret' : 'env';
		const val = displayValue(entry.sourceValue, entry.sourceIsSecret);

		if (entry.status === 'new') {
			const line = `  ${tui.colorSuccess('+')} ${tui.bold(entry.key)}=${val} ${tui.colorMuted(`(new, ${typeLabel})`)}`;
			process.stderr.write(line + '\n');
		} else if (entry.status === 'changed') {
			const oldVal = displayValue(entry.targetValue!, entry.targetIsSecret ?? false);
			// For push: show "remote_old → local_new" (replacing remote with local)
			// For pull: show "local_old → cloud_new" (replacing local with cloud)
			const line = `  ${tui.colorWarning('~')} ${tui.bold(entry.key)}=${oldVal} → ${val} ${tui.colorMuted(`(changed, ${typeLabel})`)}`;
			process.stderr.write(line + '\n');
		} else {
			const line = `  ${tui.colorMuted(`= ${entry.key}=${val} (unchanged, ${typeLabel})`)}`;
			process.stderr.write(line + '\n');
		}
	}

	tui.newline();
}
