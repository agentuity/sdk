// Cache lookup. If we've already translated this exact (text, language)
// pair, return the cached row instead of calling the AI again.
const cached = await db
	.select()
	.from(translations)
	.where(
		and(
			eq(translations.sourceText, input.text),
			eq(translations.language, input.toLanguage)
		)
	)
	.limit(1);
if (cached[0]) {
	return {
		translation: cached[0].translation,
		tokens: cached[0].tokens ?? 0,
		model: cached[0].model ?? input.model,
		toLanguage: cached[0].language,
		cached: true,
	};
}
