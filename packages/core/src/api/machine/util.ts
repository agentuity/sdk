import { StructuredError } from '../../error.ts';

export const MachineResponseError = StructuredError('MachineResponseError')<{
	message: string;
}>();
