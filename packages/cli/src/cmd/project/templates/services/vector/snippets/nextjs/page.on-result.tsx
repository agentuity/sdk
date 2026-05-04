useEffect(() => {
	if (!data?.translation) return;
	fetch(`/api/similar?q=${encodeURIComponent(text)}`)
		.then((r) => r.json())
		.then(setSimilar)
		.catch(() => setSimilar([]));
}, [data]);
