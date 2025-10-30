import type {
	KeyValueStorage,
	ObjectStorage,
	StreamStorage,
	VectorStorage,
	DataResult,
	KeyValueStorageSetParams,
	ObjectResult,
	ObjectStorePutParams,
	CreatePublicURLParams,
	Stream,
	CreateStreamProps,
	ListStreamsParams,
	ListStreamsResponse,
	VectorUpsertParams,
	VectorUpsertResult,
	VectorResult,
	VectorSearchResultWithDocument,
	VectorSearchParams,
	VectorSearchResult,
} from '@agentuity/core';

const UNAUTHENTICATED_ERROR =
	'You must authenticate to use Agentuity services. Set the AGENTUITY_SDK_KEY environment variable or provide custom service implementations in your app config.';

class UnauthenticatedError extends Error {
	constructor() {
		super(UNAUTHENTICATED_ERROR);
		this.name = 'UnauthenticatedError';
	}
}

export class UnauthenticatedKeyValueStorage implements KeyValueStorage {
	async get<T>(_name: string, _key: string): Promise<DataResult<T>> {
		throw new UnauthenticatedError();
	}

	async set<T = unknown>(
		_name: string,
		_key: string,
		_value: T,
		_params?: KeyValueStorageSetParams
	): Promise<void> {
		throw new UnauthenticatedError();
	}

	async delete(_name: string, _key: string): Promise<void> {
		throw new UnauthenticatedError();
	}
}

export class UnauthenticatedObjectStorage implements ObjectStorage {
	async get(_bucket: string, _key: string): Promise<ObjectResult> {
		throw new UnauthenticatedError();
	}

	async put(
		_bucket: string,
		_key: string,
		_data: Uint8Array | ArrayBuffer | ReadableStream,
		_params?: ObjectStorePutParams
	): Promise<void> {
		throw new UnauthenticatedError();
	}

	async delete(_bucket: string, _key: string): Promise<boolean> {
		throw new UnauthenticatedError();
	}

	async createPublicURL(
		_bucket: string,
		_key: string,
		_params?: CreatePublicURLParams
	): Promise<string> {
		throw new UnauthenticatedError();
	}
}

export class UnauthenticatedStreamStorage implements StreamStorage {
	async create(_name: string, _props?: CreateStreamProps): Promise<Stream> {
		throw new UnauthenticatedError();
	}

	async list(_params?: ListStreamsParams): Promise<ListStreamsResponse> {
		throw new UnauthenticatedError();
	}

	async delete(_id: string): Promise<void> {
		throw new UnauthenticatedError();
	}
}

export class UnauthenticatedVectorStorage implements VectorStorage {
	async upsert(_name: string, ..._documents: VectorUpsertParams[]): Promise<VectorUpsertResult[]> {
		throw new UnauthenticatedError();
	}

	async get<T extends Record<string, unknown> = Record<string, unknown>>(
		_name: string,
		_key: string
	): Promise<VectorResult<T>> {
		throw new UnauthenticatedError();
	}

	async getMany<T extends Record<string, unknown> = Record<string, unknown>>(
		_name: string,
		..._keys: string[]
	): Promise<Map<string, VectorSearchResultWithDocument<T>>> {
		throw new UnauthenticatedError();
	}

	async search<T extends Record<string, unknown> = Record<string, unknown>>(
		_name: string,
		_params: VectorSearchParams<T>
	): Promise<VectorSearchResult<T>[]> {
		throw new UnauthenticatedError();
	}

	async delete(_name: string, ..._keys: string[]): Promise<number> {
		throw new UnauthenticatedError();
	}

	async exists(_name: string): Promise<boolean> {
		throw new UnauthenticatedError();
	}
}
