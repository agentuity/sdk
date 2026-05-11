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
		'<div class="mb-6 flex flex-col gap-1">' +
		'<h3 class="m-0 text-xl font-normal leading-none text-white">Queued translations</h3>' +
		'<p class="text-xs text-gray-500">Messages published to <code class="text-gray-400">translate-jobs</code>. Add a worker to process them.</p>' +
		'</div>' +
		'<ul class="flex flex-col gap-3 text-xs text-gray-400">' +
		jobs
			.map(function (job) {
				const preview = job.text.length > 80 ? job.text.slice(0, 80) + '\u2026' : job.text;
				return (
					'<li class="flex flex-col gap-1 rounded-md border border-gray-900 bg-gray-950 px-4 py-3">' +
					'<span class="text-gray-500"><strong class="text-cyan-500">queued</strong> · ' + job.id + ' · offset ' + job.offset + '</span>' +
					'<span class="italic">' + preview + '<span class="text-gray-600"> \u2192 ' + job.toLanguage + '</span></span>' +
					'</li>'
				);
			})
			.join('') +
		'</ul>' +
		'<p class="mt-4 border-t border-gray-900 pt-4 text-[11px] text-gray-600">Queue powered by <code class="text-gray-500">@agentuity/queue</code></p>' +
		'</div>';
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
	const job = await res.json();
	jobs = [{ id: job.id, offset: job.offset, publishedAt: job.publishedAt, text, toLanguage, model }].concat(jobs);
	renderJobs();
});
