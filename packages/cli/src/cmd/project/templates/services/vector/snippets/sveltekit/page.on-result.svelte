$effect(() => {
	if (!form?.translation) return;
	(async () => {
		try {
			const res = await fetch(`/api/similar?q=${encodeURIComponent(text)}`);
			similar = res.ok ? await res.json() : [];
		} catch {
			similar = [];
		}
	})();
});
