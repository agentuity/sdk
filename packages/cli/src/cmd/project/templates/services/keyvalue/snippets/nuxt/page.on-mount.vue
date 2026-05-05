onMounted(async () => {
	try {
		const prefs = await $fetch<{ language?: string; model?: string }>('/api/preferences');
		if (prefs.language && LANGUAGES.includes(prefs.language as (typeof LANGUAGES)[number])) {
			toLanguage.value = prefs.language as (typeof LANGUAGES)[number];
		}
		if (prefs.model && MODELS.includes(prefs.model as (typeof MODELS)[number])) {
			model.value = prefs.model as (typeof MODELS)[number];
		}
	} catch {}
});
