export interface FetchSuccessResponse<TData> {
	ok: true;
	data: TData;
	response: Response;
}

export interface FetchErrorResponse {
	ok: false;
	data: never;
	response: Response;
}

export type FetchResponse<T> = FetchErrorResponse | FetchSuccessResponse<T>;

export type Body = string | Buffer | ArrayBuffer | ReadableStream;

export type HttpMethod = 'GET' | 'PUT' | 'POST' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'PATCH';

export interface FetchRequest {
	method: HttpMethod;
	body?: Body;
	signal?: AbortSignal;
	contentType?: string;
	headers?: Record<string, string>;
	telemetry?: {
		name: string;
		attributes?: Record<string, string>;
	};
	binary?: true;
	duplex?: 'half';
}

export interface FetchAdapter {
	invoke<T>(url: string, options: FetchRequest): Promise<FetchResponse<T>>;
}
