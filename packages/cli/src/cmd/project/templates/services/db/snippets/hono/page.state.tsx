const historyContainer = document.getElementById('history-container');
let history = [];

function renderHistory() {
	if (!historyContainer) return;
	if (history.length === 0) {
		historyContainer.innerHTML = '';
		return;
	}
	historyContainer.innerHTML =
		'<div class="rounded-lg border border-gray-900 bg-black p-8">' +
		'<h3 class="m-0 mb-6 text-xl font-normal leading-none text-white">History</h3>' +
		'<ul class="flex flex-col gap-3 text-xs text-gray-400">' +
		history
			.map(function (row) {
				const preview =
					row.sourceText.length > 80 ? row.sourceText.slice(0, 80) + '\u2026' : row.sourceText;
				return (
					'<li class="flex flex-col gap-0.5 rounded-md border border-gray-900 bg-gray-950 px-4 py-3">' +
					'<span class="text-gray-500 italic">' + preview + '</span>' +
					'<span class="text-cyan-500"><strong class="text-gray-400">' + row.language + ':</strong> ' + row.translation + '</span>' +
					'</li>'
				);
			})
			.join('') +
		'</ul>' +
		'<p class="mt-4 border-t border-gray-900 pt-4 text-[11px] text-gray-600">Postgres in Agentuity</p>' +
		'</div>';
}

async function loadHistory() {
	try {
		const res = await fetch('/api/history');
		if (res.ok) {
			history = await res.json();
			renderHistory();
		}
	} catch (e) {}
}
