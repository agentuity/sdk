import { StructuredError } from '../../error.ts';

export const ProjectResponseError = StructuredError('ProjectResponseError');
export const ProjectNotFoundError = StructuredError('ProjectNotFoundError')<{ id: string }>();
export const AgentNotFoundError = StructuredError('AgentNotFoundError')<{ id: string }>();
export const MalwareCheckError = StructuredError('MalwareCheckError')<{
	deploymentId: string;
}>();
