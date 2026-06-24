import { isStructuredError, StructuredError } from '@agentuity/core';

export const GenesisAuthError = StructuredError('GenesisAuthError')<{ status: number }>();

export type GenesisAuthErrorInstance = InstanceType<typeof GenesisAuthError>;

export function isGenesisAuthError(err: unknown): err is GenesisAuthErrorInstance {
	return isStructuredError(err) && err._tag === 'GenesisAuthError';
}
