const exportInfo = ref<{ filename: string; size: number } | null>(null);
const isExporting = ref(false);

async function handleExport() {
	isExporting.value = true;
	try {
		exportInfo.value = await $fetch<{ filename: string; size: number }>('/api/export', {
			method: 'POST',
		});
	} finally {
		isExporting.value = false;
	}
}
