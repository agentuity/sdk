// Persist the fresh translation so future lookups for the same input
// hit the cache above.
await db.insert(translations).values({
	sourceText: input.text,
	language: input.toLanguage,
	translation: result.translation,
	model: result.model,
	tokens: result.tokens,
});
