interface QueuedJob {
	id: string;
	text: string;
	toLanguage: string;
	model: string;
	offset: number;
	publishedAt: string;
}
const jobs = ref<QueuedJob[]>([]);

async function handleQueue() {
	const job = await $fetch<Pick<QueuedJob, 'id' | 'offset' | 'publishedAt'>>('/api/jobs', {
		method: 'POST',
		body: { text: text.value, toLanguage: toLanguage.value, model: model.value },
	});
	jobs.value = [
		{
			...job,
			text: text.value,
			toLanguage: toLanguage.value,
			model: model.value,
		},
		...jobs.value,
	];
}
