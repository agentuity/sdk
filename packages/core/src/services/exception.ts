import { StructuredError } from '../error.ts';
import { HttpMethod } from './adapter.ts';

export const ServiceException = StructuredError('ServiceException')<{
	statusCode: number;
	method: HttpMethod;
	url: string;
	sessionId?: string | null;
}>();
