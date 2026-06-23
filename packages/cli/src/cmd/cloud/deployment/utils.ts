import { StructuredError } from '@agentuity/core';
import { ErrorCode, getExitCode } from '../../../errors.ts';
import { canPrompt, createErrorResponse, isJSONMode, outputJSON } from '../../../output.ts';
import type { GlobalOptions, Logger, ProjectConfig } from '../../../types.ts';

const ProjectIDRequiredError = StructuredError(
	'ProjectIDRequiredError',
	'Project ID is required. Use --project-id or run from a project directory.'
);

export function resolveProjectId(
	ctx: { project?: ProjectConfig },
	options: { projectId?: string }
): string {
	if (options.projectId) {
		return options.projectId;
	}
	if (ctx.project?.projectId) {
		return ctx.project.projectId;
	}
	throw new ProjectIDRequiredError();
}

export function requireForceForNonInteractiveDestructiveAction(
	options: GlobalOptions,
	logger: Logger,
	action: string
): void {
	if (canPrompt(options)) {
		return;
	}

	const message = `--force is required to ${action} in non-interactive mode.`;
	if (isJSONMode(options) || options.errorFormat === 'json') {
		outputJSON(
			createErrorResponse(ErrorCode.CONFIG_INVALID, message, {
				requiredFlag: '--force',
			})
		);
		process.exit(getExitCode(ErrorCode.CONFIG_INVALID));
	}

	logger.fatal(message, ErrorCode.CONFIG_INVALID);
}
