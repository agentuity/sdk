import type { StandardSchemaV1 } from './standard_schema';

export type InferInput<T> = T extends StandardSchemaV1 ? StandardSchemaV1.InferInput<T> : never;

export type InferOutput<T> = T extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<T> : never;
