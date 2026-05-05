watch(result, async (val) => {
	if (!(val as any)?.translation) return;
	try {
		similar.value = await $fetch<SimilarHit[]>('/api/similar', {
			query: { q: text.value },
		});
	} catch {
		similar.value = [];
	}
});
