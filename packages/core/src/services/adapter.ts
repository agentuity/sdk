import { z } from 'zod';

export const FetchSuccessResponseSchema = <TData extends z.ZodTypeAny>(dataSchema: TData) =>
	z.object({
		ok: z.literal(true).describe('Indicates the fetch request was successful.'),
		data: dataSchema.describe('The parsed response data.'),
		response: z.instanceof(Response).describe('The raw Response object.'),
	});

export type FetchSuccessResponse<TData> = {
	ok: true;
	data: TData;
	response: Response;
};

export const FetchErrorResponseSchema = z.object({
	ok: z.literal(false).describe('Indicates the fetch request failed.'),
	data: z.never().describe('No data is available for failed requests.'),
	response: z.instanceof(Response).describe('The raw Response object.'),
}).describe('Error response from a fetch request.');

export type FetchErrorResponse = z.infer<typeof FetchErrorResponseSchema>;

export const FetchResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
	z.union([FetchErrorResponseSchema, FetchSuccessResponseSchema(dataSchema)]);

export type FetchResponse<T> = FetchErrorResponse | FetchSuccessResponse<T>;

export const BodySchema = z.union([
	z.string(),
	z.custom<Uint8Array>((value) => value instanceof Uint8Array),
	z.instanceof(ArrayBuffer),
	z.custom<ReadableStream>((value) => value instanceof ReadableStream),
]).describe('Request body content (string, Uint8Array, ArrayBuffer, or ReadableStream).');

export type Body = z.infer<typeof BodySchema>;

export const HttpMethodSchema = z.enum(['GET', 'PUT', 'POST', 'DELETE', 'HEAD', 'OPTIONS', 'PATCH']).describe('HTTP request method.');

export type HttpMethod = z.infer<typeof HttpMethodSchema>;

export const FetchRequestSchema = z.object({
	method: HttpMethodSchema.describe('HTTP method for the request.'),
	body: BodySchema.optional().describe('Optional request body.'),
	signal: z.instanceof(AbortSignal).optional().describe('Optional AbortSignal for request cancellation.'),
	contentType: z.string().optional().describe('Content-Type header value.'),
	headers: z.record(z.string(), z.string()).optional().describe('Additional HTTP headers.'),
	telemetry: z
		.object({
			name: z.string().describe('Telemetry span name.'),
			attributes: z.record(z.string(), z.string()).optional().describe('Additional telemetry attributes.'),
		})
		.optional()
		.describe('Optional OpenTelemetry configuration for the request.'),
	binary: z.literal(true).optional().describe('If true, treat the response as binary data.'),
	duplex: z.literal('half').optional().describe('Enable half-duplex streaming for the request.'),
}).describe('Configuration for a fetch request.');

export type FetchRequest = z.infer<typeof FetchRequestSchema>;

export interface FetchAdapter {
	invoke<T>(url: string, options: FetchRequest): Promise<FetchResponse<T>>;
}
