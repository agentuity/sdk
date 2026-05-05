useEffect(() => {
	if (data?.translation) {
		fetch('/api/history')
			.then((r) => r.json())
			.then(setHistory)
			.catch(() => {});
	}
}, [data]);
