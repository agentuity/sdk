const exportBtn = document.getElementById('export-btn');
const exportInfoEl = document.getElementById('export-info');

exportBtn?.addEventListener('click', async () => {
	exportBtn.disabled = true;
	exportBtn.textContent = 'Exporting';
	try {
		const res = await fetch('/api/export', { method: 'POST' });
		if (res.ok && exportInfoEl) {
			const info = await res.json();
			exportInfoEl.textContent = info.filename + ' (' + (info.size / 1024).toFixed(1) + ' kB)';
		}
	} finally {
		exportBtn.disabled = false;
		exportBtn.textContent = 'Export history';
	}
});
