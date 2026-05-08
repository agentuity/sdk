const queueBtn = document.getElementById('queue-btn');
const jobsContainer = document.getElementById('jobs-container');
let jobs = [];

function renderJobs() {
	if (!jobsContainer) return;
	if (jobs.length === 0) {
		jobsContainer.innerHTML = '';
		return;
	}
	jobsContainer.innerHTML =
		'<div class="rounded-lg border border-gray-900 bg-black p-8">' +
		'<h3 class="m-0 mb-6 text-xl font-normal leading-none text-white">Pending jobs</h3>' +
		'<ul class="flex flex-col gap-3 text-xs text-gray-400">' +
		jobs
			.map(function (job) {
				const preview = job.text.length > 80 ? job.text.slice(0, 80) + '\u2026' : job.text;
				return (
					'<li class="flex flex-col gap-0.5 rounded-md border border-gray-900 bg-gray-950 px-4 py-3">' +
					'<span class="text-gray-500"><strong class="text-cyan-500">queued</strong> · ' + job.id + '</span>' +
					'<span class="italic">' + preview + '<span class="text-gray-600"> \u2192 ' + job.toLanguage + '</span></span>' +
					'</li>'
				);
			})
			.join('') +
		'</ul></div>';
}

queueBtn?.addEventListener('click', async () => {
	const text = textInput.value;
	const toLanguage = toLangSelect.value;
	const model = modelSelect.value;
	const res = await fetch('/api/jobs', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ text, toLanguage, model }),
	});
	if (!res.ok) return;
	const { id } = await res.json();
	jobs = [{ id, text, toLanguage, model }].concat(jobs);
	renderJobs();
});
