let exportInfo = $state<{ filename: string; size: number } | null>(null);
let isExporting = $state(false);

async function handleExport() {
	isExporting = true;
	try {
		const res = await fetch('/api/export', { method: 'POST' });
		if (res.ok) exportInfo = await res.json();
	} finally {
		isExporting = false;
	}
}
