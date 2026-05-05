useEffect(() => {
	if (mutation.data?.translation) {
		fetch('/api/preferences', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ language: toLanguage, model }),
		}).catch(() => {});
	}
}, [mutation.data]);
