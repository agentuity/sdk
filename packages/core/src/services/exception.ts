import { StructuredError } from '../error.ts';
import type { HttpMethod } from './adapter.ts';

export interface ServiceExceptionPayload {
	statusCode: number;
	method: HttpMethod;
	url: string;
	sessionId?: string | null;
}

export const ServiceException = StructuredError('ServiceException')<ServiceExceptionPayload>();
