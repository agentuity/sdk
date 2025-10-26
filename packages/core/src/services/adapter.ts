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

export interface FetchRequest {
	method: 'GET' | 'PUT' | 'POST' | 'DELETE';
	body?: Body;
	signal?: AbortSignal;
	contentType?: string;
	headers?: Record<string, string>;
	telemetry?: {
		name: string;
		attributes?: Record<string, string>;
	};
}

export interface FetchAdapter {
	invoke<T>(url: string, options: FetchRequest): Promise<FetchResponse<T>>;
}
