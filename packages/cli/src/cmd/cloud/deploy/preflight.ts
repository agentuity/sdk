/**
 * Preflight phase
 * ---------------
 *
 * The "before we touch anything heavy" phase. Runs in the parent process
 * only (the forked child re-enters deploy with `AGENTUITY_DEPLOYMENT`
 * already set, skipping this phase entirely).
 *
 * Responsibilities:
 *   1. Validate the deployment config in agentuity.json:
 *        - resource limits (`validateResources`)
 *        - apt dependencies (`validateAptDependencies`)
 *      Any failure is fatal: we deliberately surface it before creating a
 *      cloud deployment so we don't leave half-finished records lying
 *      around server-side.
 *   2. Create the deployment record on the server. The returned
 *      `Deployment` carries the deploy id, the public key for client-side
 *      encryption, and the stream URL the child process will tail logs
 *      from.
 *
 * Forking the child process is intentionally NOT in this phase. That
 * concern belongs in `deploy-fork.ts` which knows how to spawn, wire
 * stdio, capture diagnostics, and report cancellation. Preflight just
 * produces the inputs the fork module needs.
 */

import type { Logger } from '@agentuity/core';
import { type Deployment, projectDeploymentCreate, validateResources } from '@agentuity/server';
import type { APIClient } from '../../../api';
import { ErrorCode } from '../../../errors';
import * as tui from '../../../tui';
import type { Config, Project } from '../../../types';
import { validateAptDependencies } from '../../../utils/apt-validator';

// `Project['deployment']` is the parsed agentuity.json deploy section.
// We re-export it under a friendlier name for callers — it carries
// resources, dependencies, domains, etc. and is the same shape the server
// expects via `projectDeploymentCreate`.
type DeploymentConfigShape = NonNullable<Project['deployment']>;

export interface PreflightParams {
	/** Resolved project (output of the Register phase). */
	project: Project;
	/** API client for deployment creation. */
	apiClient: APIClient;
	/** CLI config for region resolution / overrides used by apt validation. */
	config: Config | null | undefined;
	/** Logger to thread through. */
	logger: Logger;
	/**
	 * Whether the caller wants JSON output. Apt validation failures format
	 * differently in JSON mode (so callers can render `errors[]` themselves
	 * before we exit). When set, we throw `PreflightAptValidationError`
	 * carrying the structured payload instead of fatal-rendering.
	 */
	json: boolean;
}

export interface PreflightResult {
	/** Newly-created deployment record. */
	deployment: Deployment;
	/** The exact deployment config we sent to the server (echoed for callers). */
	deploymentConfig: DeploymentConfigShape;
}

/**
 * Thrown when apt validation fails AND the caller asked for JSON output.
 * The `payload` field is the structured error envelope the deploy command
 * returns from its handler; callers should serialize and exit.
 */
export class PreflightAptValidationError extends Error {
	readonly payload: {
		success: false;
		deploymentId: '';
		projectId: string;
		errors: Array<{
			type: 'invalid-apt-dependency';
			package: string;
			error: string;
			searchUrl: string;
			availableVersions?: string[];
		}>;
	};

	constructor(payload: PreflightAptValidationError['payload']) {
		super('Apt validation failed');
		this.name = 'PreflightAptValidationError';
		this.payload = payload;
	}
}

/**
 * Run the preflight phase in the parent process. Fatals on validation
 * failure (or throws `PreflightAptValidationError` when `json: true`).
 * On success, returns the new `Deployment` and the config that produced it.
 */
export async function runPreflight(params: PreflightParams): Promise<PreflightResult> {
	const { project, apiClient, config, logger, json } = params;

	// `project.deployment` is the user-controlled deploy section of
	// agentuity.json (resources, dependencies, domains, etc.). It's
	// optional; an absent block means "use server defaults".
	const deploymentConfig: DeploymentConfigShape = (project.deployment ??
		{}) as DeploymentConfigShape;

	// Resource limits validation — local-only, no API calls. Fatals on
	// invalid config so we never create a deployment we can't run.
	if (deploymentConfig.resources) {
		const validation = validateResources(deploymentConfig.resources);
		if (!validation.valid) {
			tui.error('Invalid resource configuration in agentuity.json:');
			for (const error of validation.errors) {
				tui.error(`  ${error}`);
			}
			tui.fatal('Fix the resource configuration and try again.', ErrorCode.CONFIG_INVALID);
		}
	}

	// Apt dependency validation — needs network access (queries the apt
	// registry per region). Wrapped in a spinner because it can take a
	// few seconds for projects with many packages.
	if (deploymentConfig.dependencies && deploymentConfig.dependencies.length > 0) {
		const aptValidation = await tui.spinner({
			message: 'Validating apt dependencies...',
			type: 'simple',
			callback: async () => {
				return await validateAptDependencies(
					deploymentConfig.dependencies!,
					project.region,
					config ?? null,
					logger
				);
			},
		});

		if (aptValidation.invalid.length > 0) {
			// JSON callers (e.g. CI integrations) want the structured error
			// envelope back through their own renderer rather than the
			// pretty TUI box. Throw a typed error so the caller can wire it
			// to their JSON exit path.
			if (json) {
				throw new PreflightAptValidationError({
					success: false,
					deploymentId: '',
					projectId: project.projectId,
					errors: aptValidation.invalid.map((pkg) => ({
						type: 'invalid-apt-dependency',
						package: pkg.package,
						error: pkg.error,
						searchUrl: pkg.searchUrl,
						availableVersions: pkg.availableVersions,
					})),
				});
			}

			tui.error('Invalid apt dependencies in agentuity.json:');
			tui.newline();
			for (const pkg of aptValidation.invalid) {
				tui.bullet(`${tui.bold(pkg.package)}: ${pkg.error}`);
				if (pkg.availableVersions && pkg.availableVersions.length > 0) {
					tui.muted(`    Available versions: ${pkg.availableVersions.join(', ')}`);
				}
				tui.muted(`    Search: ${tui.link(pkg.searchUrl)}`);
			}
			tui.newline();
			tui.fatal(
				'Fix the apt dependencies and try again. Search for valid packages at: https://packages.debian.org/stable/',
				ErrorCode.CONFIG_INVALID
			);
		}
	}

	// Server-side: create the deployment record. Returns id + publicKey
	// + stream URLs that the child build process needs.
	const deployment = await projectDeploymentCreate(apiClient, project.projectId, deploymentConfig);
	logger.debug('Created deployment: %s', deployment.id);

	return { deployment, deploymentConfig };
}
