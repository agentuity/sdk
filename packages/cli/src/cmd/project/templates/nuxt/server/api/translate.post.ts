export default defineEventHandler(async (event) => {
	const { text, toLanguage, model = 'gpt-4o-mini' } = await readBody(event);
	return translate({ text, toLanguage, model });
});
