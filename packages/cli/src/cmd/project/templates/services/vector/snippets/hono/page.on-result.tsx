try {
	const simRes = await fetch('/api/similar?q=' + encodeURIComponent(text));
	if (simRes.ok) renderSimilar(await simRes.json());
} catch (e) {
	renderSimilar([]);
}
