import { StructuredError } from '@agentuity/core';

export const BUCKET_CONFIG_API_VERSION = '2026-02-28';
export const STORAGE_OBJECTS_API_VERSION = '2026-03-01';

// Keep the old name exported for backward compat
export const API_VERSION = BUCKET_CONFIG_API_VERSION;

export const BucketConfigResponseError = StructuredError('BucketConfigResponseError');
export const StorageObjectsResponseError = StructuredError('StorageObjectsResponseError');
