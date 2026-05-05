useEffect(() => {
	if (!result?.translation) return;
	fetch(`/api/similar?q=${encodeURIComponent(text)}`)
		.then((r) => r.json())
		.then(setSimilar)
		.catch(() => setSimilar([]));
}, [result]);
