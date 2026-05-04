useEffect(() => {
	fetch('/api/preferences')
		.then((r) => r.json())
		.then((prefs) => {
			if (LANGUAGES.includes(prefs.language)) setToLanguage(prefs.language);
			if (MODELS.includes(prefs.model)) setModel(prefs.model);
		})
		.catch(() => {});
}, []);
