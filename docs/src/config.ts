export const VECTOR_STORE_NAME = process.env.VECTOR_STORE_NAME || 'agentuity-docs';
export const vectorSearchNumber = 10;
export const KV_STORE_NAME = process.env.KV_STORE_NAME || 'docs-sandbox-chat-sessions';

export const config = {
	vectorStoreName: VECTOR_STORE_NAME,
	vectorSearchNumber,
	kvStoreName: KV_STORE_NAME,
};
