useEffect(() => {
	fetch('/api/history')
		.then((r) => r.json())
		.then(setHistory)
		.catch(() => {});
}, []);
