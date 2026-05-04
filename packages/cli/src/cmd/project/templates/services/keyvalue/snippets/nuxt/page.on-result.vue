watch(result, (val) => {
	if ((val as any)?.translation) {
		$fetch('/api/preferences', {
			method: 'POST',
			body: { language: toLanguage.value, model: model.value },
		}).catch(() => {});
	}
});
