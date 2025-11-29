import { StructuredError } from '@agentuity/core';

export const ProjectResponseError = StructuredError('ProjectResponseError');
export const ProjectNotFoundError = StructuredError('ProjectNotFoundError')<{ id: string }>();
export const AgentNotFoundError = StructuredError('AgentNotFoundError')<{ id: string }>();
