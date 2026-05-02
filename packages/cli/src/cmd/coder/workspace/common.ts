import {
	type CoderCreateWorkspaceRequest,
	type CoderUpdateWorkspaceRequest,
	type CoderWorkspaceDetail,
} from '@agentuity/core/coder';
import * as tui from '../../../tui';

export const EMPTY_WORKSPACE_ERROR =
	'A workspace needs at least one repo, dependency, setup script, saved skill, skill bucket, or agent';

export function parseCommaList(value?: string): string[] {
	return value
		? value
				.split(',')
				.map((item) => item.trim())
				.filter(Boolean)
		: [];
}

export async function readSetupScript(input: {
	setupScript?: string;
	setupScriptFile?: string;
}): Promise<string | undefined> {
	if (input.setupScript && input.setupScriptFile) {
		throw new Error('Use either --setup-script or --setup-script-file, not both.');
	}
	if (input.setupScript) return input.setupScript;
	if (!input.setupScriptFile) return undefined;
	return Bun.file(input.setupScriptFile).text();
}

export function hasWorkspaceSelections(input: CoderCreateWorkspaceRequest): boolean {
	return (
		(input.repos?.length ?? 0) > 0 ||
		(input.dependencies?.length ?? 0) > 0 ||
		Boolean(input.setupScript?.trim()) ||
		(input.savedSkillIds?.length ?? 0) > 0 ||
		(input.skillBucketIds?.length ?? 0) > 0 ||
		(input.enabledAgents?.length ?? 0) > 0
	);
}

export function hasWorkspaceUpdate(input: CoderUpdateWorkspaceRequest): boolean {
	return Object.keys(input).length > 0;
}

export function formatWorkspaceValidationMessage(issues: Array<{ message: string }>): string {
	const messages = [...new Set(issues.map((issue) => issue.message).filter(Boolean))];
	if (messages.length === 0) {
		return 'Invalid workspace configuration';
	}
	if (messages.includes(EMPTY_WORKSPACE_ERROR)) {
		return `${EMPTY_WORKSPACE_ERROR}. Use --repo, --dependency, --setup-script, or --enabled-agents.`;
	}
	return messages.join('; ');
}

export function printWorkspaceSummary(workspace: CoderWorkspaceDetail): void {
	const enabledAgents = Array.isArray(workspace.enabledAgents)
		? workspace.enabledAgents.filter((name): name is string => typeof name === 'string')
		: [];
	const dependencies = Array.isArray(workspace.dependencies) ? workspace.dependencies : [];

	tui.output(`  Name:        ${tui.bold(workspace.name)}`);
	if (workspace.description) {
		tui.output(`  Description: ${workspace.description}`);
	}
	tui.output(`  Scope:       ${workspace.scope}`);
	tui.output(`  Repos:       ${workspace.repoCount}`);
	tui.output(`  Selections:  ${workspace.selectionCount}`);
	if (dependencies.length > 0) {
		tui.output(`  Dependencies:${dependencies.length === 1 ? ` ${dependencies[0]}` : ''}`);
		for (const dependency of dependencies.length === 1 ? [] : dependencies) {
			tui.output(`    - ${dependency}`);
		}
	}
	if (workspace.setupScript) {
		tui.output('  Setup:       configured');
	}
	if (workspace.snapshot?.status) {
		tui.output(`  Snapshot:    ${workspace.snapshot.status}`);
	}
	if (enabledAgents.length > 0) {
		tui.output(`  Agents:      ${enabledAgents.join(', ')}`);
	}
}
