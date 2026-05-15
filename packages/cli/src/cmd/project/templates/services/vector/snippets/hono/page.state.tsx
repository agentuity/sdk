const similarContainer = document.getElementById('similar-container');

function renderSimilar(hits) {
	if (!similarContainer) return;
	if (hits.length === 0) {
		similarContainer.innerHTML = '';
		return;
	}
	similarContainer.innerHTML =
		'<div class="rounded-md border border-gray-900 bg-gray-950 px-4 py-3 text-xs text-gray-400">' +
		'<div class="mb-2 text-gray-500">Similar past translations</div>' +
		'<ul class="flex flex-col gap-1.5">' +
		hits
			.map(function (hit) {
				const label = (hit.metadata && hit.metadata.translation) || hit.key;
				return (
					'<li class="flex items-center justify-between gap-3">' +
					'<span class="text-gray-300">' + label + '</span>' +
					'<span class="text-gray-600">' + hit.similarity.toFixed(3) + '</span>' +
					'</li>'
				);
			})
			.join('') +
		'</ul>' +
		'<p class="mt-3 border-t border-gray-900 pt-3 text-[11px] text-gray-600">Search powered by <code class="text-gray-500">@agentuity/vector</code></p>' +
		'</div>';
}
