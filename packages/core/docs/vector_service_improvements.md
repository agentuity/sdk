# VectorStorage Service - Proposed Improvements

## Overview

This document proposes improvements to the VectorStorage service interface and implementation to enhance type safety, developer ergonomics, and API consistency.

## Proposed Improvements

### 1. Use Discriminated Union for `get()` Result (High Priority)

**Current Implementation:**

```typescript
get(name: string, key: string): Promise<VectorSearchResultWithDocument | null>;
```

**Issues:**

- Returns `null` when not found, requiring null checks
- Less type-safe than the pattern used in KeyValueStorage
- No way to distinguish between "not found" and other response metadata

**Proposed:**

```typescript
export interface VectorResultFound {
  data: VectorSearchResultWithDocument;
  exists: true;
}

export interface VectorResultNotFound {
  data: never;
  exists: false;
}

export type VectorResult = VectorResultFound | VectorResultNotFound;

// Interface method:
get(name: string, key: string): Promise<VectorResult>;
```

**Benefits:**

```typescript
// Better type narrowing
const result = await vectorStorage.get('docs', 'key1');
if (result.exists) {
	console.log(result.data.document); // ✅ TypeScript knows data exists
} else {
	console.log('Not found'); // ✅ TypeScript knows data is never
}

// vs current (requires null check)
const result = await vectorStorage.get('docs', 'key1');
if (result !== null) {
	console.log(result.document); // Less elegant
}
```

**Consistency:** Matches the `DataResult<T>` pattern from KeyValueStorage

---

### 2. Return Upsert Results with Key Mapping (Medium Priority)

**Current Implementation:**

```typescript
upsert(name: string, ...documents: VectorUpsertParams[]): Promise<string[]>;
```

**Issues:**

- Returns IDs but loses mapping to original documents
- Relies on array order being preserved (fragile)
- Can't easily associate ID with the key that was upserted

**Proposed:**

```typescript
export interface VectorUpsertResult {
  key: string;  // The key from the input document
  id: string;   // The generated ID from the server
}

// Interface method:
upsert(name: string, ...documents: VectorUpsertParams[]): Promise<VectorUpsertResult[]>;
```

**Benefits:**

```typescript
// Before: Relies on order
const ids = await vectorStorage.upsert(
	'docs',
	{ key: 'doc1', document: 'First' },
	{ key: 'doc2', document: 'Second' }
);
// ids = ['id-123', 'id-456']
// Which ID corresponds to which key? Must assume order.

// After: Explicit mapping
const results = await vectorStorage.upsert(
	'docs',
	{ key: 'doc1', document: 'First' },
	{ key: 'doc2', document: 'Second' }
);
// results = [
//   { key: 'doc1', id: 'id-123' },
//   { key: 'doc2', id: 'id-456' }
// ]
const doc1Id = results.find((r) => r.key === 'doc1')?.id;
```

**Implementation Note:** Would need to track keys in order during the request to build this mapping from the API response.

---

### 3. Add Namespace/Collection Builder Pattern (Low Priority - Optional)

**Current Implementation:**

```typescript
await vectorStorage.upsert('my-docs', doc1, doc2);
await vectorStorage.search('my-docs', { query: 'test' });
await vectorStorage.delete('my-docs', 'key1');
```

**Issues:**

- Storage name repeated in every call
- Easy to make typos leading to bugs
- No autocomplete for storage names

**Proposed (Optional):**

```typescript
export interface VectorCollection {
  readonly name: string;
  upsert(...documents: VectorUpsertParams[]): Promise<VectorUpsertResult[]>;
  get(key: string): Promise<VectorResult>;
  search<T extends Record<string, unknown>>(params: VectorSearchParams<T>): Promise<VectorSearchResult[]>;
  delete(...keys: string[]): Promise<number>;
}

// VectorStorage interface adds:
collection(name: string): VectorCollection;
```

**Benefits:**

```typescript
// Before: Repeat storage name
await vectorStorage.upsert('my-docs', doc1);
await vectorStorage.search('my-docs', { query: 'test' });

// After: Bind to collection
const docs = vectorStorage.collection('my-docs');
await docs.upsert(doc1);
await docs.search({ query: 'test' });

// Type-safe collection names with const
const COLLECTIONS = {
	PRODUCTS: 'products',
	ARTICLES: 'articles',
} as const;

const products = vectorStorage.collection(COLLECTIONS.PRODUCTS);
await products.upsert(product);
```

**Trade-offs:**

- ✅ More ergonomic for repeated operations on same collection
- ✅ Reduces duplication and typos
- ❌ Adds complexity to implementation
- ❌ Not a common pattern in existing services

**Recommendation:** Consider for v2 or as separate convenience API

---

### 4. Batch Get Operation (Medium Priority)

**Current Implementation:**

```typescript
// Only single get supported
get(name: string, key: string): Promise<VectorResult>;

// To get multiple, need multiple calls:
const results = await Promise.all([
  vectorStorage.get('docs', 'key1'),
  vectorStorage.get('docs', 'key2'),
  vectorStorage.get('docs', 'key3'),
]);
```

**Proposed:**

```typescript
// Add batch get method
getMany(name: string, ...keys: string[]): Promise<Map<string, VectorSearchResultWithDocument>>;
// Or alternatively:
getMany(name: string, ...keys: string[]): Promise<VectorResult[]>;
```

**Benefits:**

```typescript
// Single API call for multiple keys
const results = await vectorStorage.getMany('docs', 'key1', 'key2', 'key3');

// Map-based return makes lookup easy:
if (results.has('key1')) {
	console.log(results.get('key1'));
}

// Or array-based with key included:
const results = await vectorStorage.getMany('docs', 'key1', 'key2', 'key3');
results.forEach((result) => {
	if (result.exists) {
		console.log(result.data.key, result.data.document);
	}
});
```

**Trade-offs:**

- ✅ More efficient (single API call vs N calls)
- ✅ Common use case for vector operations
- ❌ Requires API support (may not exist yet)

---

### 5. Improve Search Error Semantics (Low Priority)

**Current Implementation:**

```typescript
// Returns empty array for both "no results" and "storage doesn't exist"
search(name: string, params: VectorSearchParams): Promise<VectorSearchResult[]>;
```

**Issues:**

- Can't distinguish between "no matches found" and "storage doesn't exist"
- Silent failure might hide bugs

**Proposed Option A: Throw on non-existent storage**

```typescript
// Throws ServiceException if storage doesn't exist (404)
// Returns [] if storage exists but no matches
search(name: string, params: VectorSearchParams): Promise<VectorSearchResult[]>;
```

**Proposed Option B: Return metadata**

```typescript
export interface VectorSearchResponse {
  results: VectorSearchResult[];
  total: number;
  exists: boolean;  // Whether the storage exists
}

search(name: string, params: VectorSearchParams): Promise<VectorSearchResponse>;
```

**Benefits:**

```typescript
// Option A: Clear error
try {
	const results = await vectorStorage.search('non-existent', { query: 'test' });
	// results.length === 0 means no matches, but storage exists
} catch (err) {
	// Storage doesn't exist
}

// Option B: Explicit checking
const response = await vectorStorage.search('my-docs', { query: 'test' });
if (!response.exists) {
	console.log('Storage does not exist');
} else if (response.results.length === 0) {
	console.log('No matches found');
} else {
	console.log(`Found ${response.total} matches`);
}
```

**Recommendation:** Option A aligns better with existing patterns (get throws, search should too).

---

### 6. Type-Safe Metadata Throughout (Low Priority)

**Current Implementation:**

```typescript
// Generic only at method level
search<T extends Record<string, unknown>>(
  name: string,
  params: VectorSearchParams<T>
): Promise<VectorSearchResult[]>;

// But VectorSearchResult has untyped metadata:
export interface VectorSearchResult {
  metadata?: Record<string, unknown>;
}
```

**Proposed:**

```typescript
export interface VectorSearchResult<T extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  key: string;
  metadata?: T;  // Type-safe metadata
  similarity: number;
}

// Method returns typed results:
search<T extends Record<string, unknown> = Record<string, unknown>>(
  name: string,
  params: VectorSearchParams<T>
): Promise<VectorSearchResult<T>[]>;
```

**Benefits:**

```typescript
interface ProductMetadata {
	category: string;
	price: number;
	inStock: boolean;
}

const results = await vectorStorage.search<ProductMetadata>('products', {
	query: 'laptop',
	metadata: { category: 'electronics' },
});

// TypeScript knows the metadata type:
results.forEach((result) => {
	if (result.metadata) {
		console.log(result.metadata.price); // ✅ Type-safe
		console.log(result.metadata.category); // ✅ Type-safe
	}
});
```

---

### 7. Add Exists Check Method (Low Priority)

**Current Implementation:**

```typescript
// No way to check if storage exists without querying
const result = await vectorStorage.get('docs', 'any-key');
// or
const results = await vectorStorage.search('docs', { query: 'anything' });
```

**Proposed:**

```typescript
/**
 * Check if a vector storage exists
 *
 * @param name - the storage name
 * @returns true if storage exists, false otherwise
 */
exists(name: string): Promise<boolean>;
```

**Benefits:**

```typescript
if (await vectorStorage.exists('my-docs')) {
	// Proceed with operations
} else {
	// Create or handle missing storage
}
```

---

## Recommended Implementation Priority

### Phase 1: High Priority (Breaking Changes)

1. **Use VectorResult discriminated union for `get()`**
   - Better type safety
   - Consistency with KeyValueStorage
   - Breaking change, do it now

2. **Return VectorUpsertResult[] from `upsert()`**
   - Critical for correlating IDs with keys
   - Breaking change, do it now

### Phase 2: Medium Priority (Additive)

3. **Add `getMany()` for batch operations**
   - Non-breaking addition
   - Significant performance improvement

4. **Throw on search with non-existent storage**
   - Potentially breaking if code relies on empty array
   - But more correct behavior

### Phase 3: Low Priority (Nice to Have)

5. **Type-safe metadata in results**
   - Non-breaking with default type parameter
   - Improves type safety

6. **Add `exists()` method**
   - Non-breaking addition
   - Convenience method

7. **Collection builder pattern**
   - Consider for v2
   - More complex to implement

## Implementation Example

Here's what the improved interface would look like:

```typescript
export interface VectorResult {
  data: VectorSearchResultWithDocument;
  exists: true;
} | {
  data: never;
  exists: false;
};

export interface VectorUpsertResult {
  key: string;
  id: string;
}

export interface VectorSearchResult<T extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  key: string;
  metadata?: T;
  similarity: number;
}

export interface VectorStorage {
  upsert(name: string, ...documents: VectorUpsertParams[]): Promise<VectorUpsertResult[]>;

  get(name: string, key: string): Promise<VectorResult>;

  getMany(name: string, ...keys: string[]): Promise<Map<string, VectorSearchResultWithDocument>>;

  search<T extends Record<string, unknown> = Record<string, unknown>>(
    name: string,
    params: VectorSearchParams<T>
  ): Promise<VectorSearchResult<T>[]>;

  delete(name: string, ...keys: string[]): Promise<number>;

  exists(name: string): Promise<boolean>;
}
```

## Migration Path

For breaking changes, provide clear migration guide:

```typescript
// Before (v1):
const result = await vectorStorage.get('docs', 'key1');
if (result !== null) {
	console.log(result.document);
}

// After (v2):
const result = await vectorStorage.get('docs', 'key1');
if (result.exists) {
	console.log(result.data.document);
}

// Before (v1):
const ids = await vectorStorage.upsert('docs', doc1, doc2);
console.log(ids[0]); // Hope this is doc1's ID

// After (v2):
const results = await vectorStorage.upsert('docs', doc1, doc2);
const doc1Id = results.find((r) => r.key === doc1.key)?.id;
```

## Questions for Discussion

1. Should we implement all Phase 1 changes together or incrementally?
2. Is the collection builder pattern worth the added complexity?
3. Should `getMany()` return Map or Array?
4. Do we need migration helpers or is documentation sufficient?
5. Should we version the API endpoints when making these changes?
