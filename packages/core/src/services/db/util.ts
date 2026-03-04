import { StructuredError } from '../../error.ts';

export const DbResponseError = StructuredError('DbResponseError')<{ database: string }>();

export const DbInvalidArgumentError = StructuredError('DbInvalidArgumentError')<{
	orgId?: string;
	region?: string;
	query?: string;
}>();
