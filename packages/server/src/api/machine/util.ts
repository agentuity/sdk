import { StructuredError } from '@agentuity/core';

export const MachineResponseError = StructuredError('MachineResponseError')<{
	message: string;
}>();
