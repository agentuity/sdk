/**
 * Register phase
 * --------------
 *
 * Resolves and verifies the cloud project that will receive this deployment.
 *
 * Responsibilities:
 *   - Run `reconcileProject` to either confirm access to an existing
 *     `agentuity.json` project or register/import a new one (writes
 *     agentuity.json + .env, syncs env vars to the cloud).
 *   - Handle the region-mismatch case: if local agentuity.json says one
 *     region but the cloud project lives in another, confirm with the user
 *     and update the server.
 *
 * Failure modes are surfaced via `tui.fatal()` so the rest of the deploy
 * pipeline never runs without a real, accessible project. That matches the
 * old behavior under `requires.project: true`, just with the resolution
 * moved into the handler so it can also create a project from scratch in a
 * vanilla JS/TS directory.
 *
 * GitHub auto-deploy linking is intentionally NOT done here — that prompt
 * lives later in the deploy pipeline (after the SDK key check and the
 * abort/handle setup) so it can be cleanly cancelled by the existing
 * DeploymentCancelledError flow.
 */

import type { Logger } from '@agentuity/core';
import { projectGet, projectUpdateRegion } from '@agentuity/server';
import type { APIClient } from '../../../api.ts';
import { getCachedProject, setCachedProject } from '../../../cache/index.ts';
import { ErrorCode } from '../../../errors.ts';
import * as tui from '../../../tui.ts';
import type { AuthData, Config, Project } from '../../../types.ts';

export interface RegisterParams {
	/** Project as resolved by cli.ts (may be undefined if no agentuity.json). */
	project: Project | undefined;
	/** Absolute path to the project root. */
	projectDir: string;
	/** API client (auth resolved). */
	apiClient: APIClient;
	/** Auth data for reconcile (which may need to call listOrganizations etc.). */
	auth: AuthData;
	/** Loaded CLI config (profile, overrides). */
	config: Config;
	/** Logger to thread through. */
	logger: Logger;
	/** Whether the user passed `--confirm` (used in non-TTY region change). */
	confirm: boolean;
	/** Resolved by `isTTY()` at the call site so we don't import auth here. */
	interactive: boolean;
}

export interface RegisterResult {
	/** Project guaranteed to be registered and accessible. */
	project: Project;
	/** Whether the project was freshly registered/imported by this call. */
	imported: boolean;
}

/**
 * Run the register phase. Either resolves an existing project or
 * creates/imports one, then ensures the local region matches the server.
 *
 * The function fatals (via `tui.fatal`) on any unrecoverable problem
 * because deploy cannot continue without a registered project. Callers
 * therefore don't need to handle a `null`/error return.
 */
export async function runRegister(params: RegisterParams): Promise<RegisterResult> {
	const { projectDir, apiClient, auth, config, logger, confirm, interactive } = params;

	// Lazy-load reconcile to keep the deploy command's startup cost low
	// (this matches what deploy.ts used to do inline).
	const { reconcileProject } = await import('../../project/reconcile.ts');

	const reconcileResult = await reconcileProject({
		dir: projectDir,
		auth,
		apiClient,
		config,
		logger,
		interactive,
	});

	if (reconcileResult.status === 'error') {
		// `tui.fatal` calls process.exit. Use `as never` so callers see a
		// non-undefined return type from runRegister.
		tui.fatal(
			reconcileResult.message ?? 'Project reconciliation failed.',
			ErrorCode.PROJECT_NOT_FOUND
		);
	}

	if (reconcileResult.status === 'skipped') {
		tui.fatal(
			'Project must be registered with Agentuity Cloud to deploy.',
			ErrorCode.PROJECT_NOT_FOUND
		);
	}

	let project: Project | undefined = params.project;
	let imported = false;

	if (reconcileResult.status === 'imported' && reconcileResult.project) {
		project = reconcileResult.project;
		imported = true;
		// The reconcile flow already prints a success line; add a blank
		// line so the next phase's output isn't crammed against it.
		tui.newline();
	}

	if (reconcileResult.status === 'valid' && reconcileResult.project) {
		project = reconcileResult.project;
	}

	if (!project) {
		// Reconcile reported success but didn't return a project config and
		// the caller didn't have one to start with. Treat this as a hard
		// error — never attempt to deploy without a registered project.
		tui.fatal(
			'Could not resolve a registered project for this directory.',
			ErrorCode.PROJECT_NOT_FOUND
		);
	}

	// Region reconciliation: if the local agentuity.json points at a
	// different region than the server thinks the project lives in, ask
	// the user (or require --confirm in non-TTY) before pushing the
	// region change. Failures fetching the server project are non-fatal:
	// we trace and continue with the local region.
	if (project.region) {
		try {
			const profile = config.name ?? 'default';
			let serverProject = getCachedProject(profile, project.projectId);
			if (!serverProject) {
				serverProject = await projectGet(apiClient, {
					id: project.projectId,
					keys: false,
				});
				setCachedProject(profile, project.projectId, serverProject);
			}
			const serverRegion = serverProject.cloudRegion;

			if (serverRegion && serverRegion !== project.region) {
				logger.debug(
					'Region mismatch detected: local=%s, server=%s',
					project.region,
					serverRegion
				);

				if (interactive) {
					tui.newline();
					tui.warning(
						`Region change detected: ${tui.bold(serverRegion)} → ${tui.bold(project.region)}`
					);
					const confirmChange = await tui.confirm(
						'Do you want to update the project region?',
						false
					);

					if (!confirmChange) {
						tui.newline();
						tui.fatal(
							'Deployment cancelled. Update the region in agentuity.json or keep the current region.',
							ErrorCode.CONFIG_INVALID
						);
					}
				} else {
					// Non-interactive: require --confirm
					if (!confirm) {
						tui.fatal(
							`Region change detected (${serverRegion} → ${project.region}). Use --confirm flag to proceed with region change in non-interactive mode.`,
							ErrorCode.CONFIG_INVALID
						);
					}
					logger.debug('Region change confirmed via --confirm flag');
				}

				await tui.spinner({
					message: 'Updating project region...',
					type: 'simple',
					callback: async () => {
						await projectUpdateRegion(apiClient, project.projectId, project.region);
					},
				});
				tui.success(`Project region updated to ${tui.bold(project.region)}`);
				tui.newline();
			}
		} catch (err) {
			// Re-throw region-change fatals (they bubble up through
			// tui.fatal already, but we keep the explicit guard for
			// any future thrown error in this block).
			if (err instanceof Error && err.message.includes('Region change detected')) {
				throw err;
			}
			logger.trace('Failed to check project region: %s', err);
		}
	}

	return { project, imported };
}
