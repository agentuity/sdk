interface QueuedJob {
	id: string;
	text: string;
	toLanguage: string;
	model: string;
	at: number;
}
const jobs = ref<QueuedJob[]>([]);

async function handleQueue() {
	const res = await $fetch<{ id: string }>('/api/jobs', {
		method: 'POST',
		body: { text: text.value, toLanguage: toLanguage.value, model: model.value },
	});
	jobs.value = [
		{
			id: res.id,
			text: text.value,
			toLanguage: toLanguage.value,
			model: model.value,
			at: Date.now(),
		},
		...jobs.value,
	];
}
