import { StructuredError } from '@agentuity/core';

export const DbResponseError = StructuredError('DbResponseError');
export const DbInvalidArgumentError = StructuredError('DbInvalidArgumentError')<{
	orgId?: string;
	region?: string;
}>();
