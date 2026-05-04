onMount(async () => {
	try {
		const res = await fetch('/api/preferences');
		if (!res.ok) return;
		const prefs = await res.json();
		if (prefs.language && LANGUAGES.includes(prefs.language)) toLanguage = prefs.language;
		if (prefs.model && MODELS.includes(prefs.model)) model = prefs.model;
	} catch {}
});
