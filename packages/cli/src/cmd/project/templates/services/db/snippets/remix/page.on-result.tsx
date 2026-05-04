useEffect(() => {
	if (result?.translation) {
		fetch('/api/history')
			.then((r) => r.json())
			.then(setHistory)
			.catch(() => {});
	}
}, [result]);
