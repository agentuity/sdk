import { StructuredError } from '@agentuity/core';

export const SandboxResponseError = StructuredError('SandboxResponseError')<{
	sandboxId?: string;
	executionId?: string;
}>();

export const API_VERSION = '2025-03-17';
