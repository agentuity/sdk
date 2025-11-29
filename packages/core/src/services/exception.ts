import { StructuredError } from '../error';
import { HttpMethod } from './adapter';

export const ServiceException = StructuredError('ServiceException')<{
	statusCode: number;
	method: HttpMethod;
	url: string;
	sessionId?: string | null;
}>();
