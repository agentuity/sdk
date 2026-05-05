// Index the source text for semantic-similarity search.
await vector.upsert(VECTOR_NAMESPACE, {
	key: `${input.text}:${input.toLanguage}`,
	document: input.text,
	metadata: { language: input.toLanguage, translation: result.translation },
});
