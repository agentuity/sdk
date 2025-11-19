import { ProjectConfig } from '../../../types';

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
	throw new Error('Project ID is required. Use --project-id or run from a project directory.');
}
