{#if history.length > 0}
	<div class="rounded-lg border border-gray-900 bg-black p-8">
		<h3 class="m-0 mb-6 text-xl font-normal leading-none text-white">History</h3>
		<ul class="flex flex-col gap-3 text-xs text-gray-400">
			{#each history as row (row.id)}
				<li class="flex flex-col gap-0.5 rounded-md border border-gray-900 bg-gray-950 px-4 py-3">
					<span class="text-gray-500 italic">
						{row.sourceText.length > 80 ? `${row.sourceText.slice(0, 80)}\u2026` : row.sourceText}
					</span>
					<span class="text-cyan-500">
						<strong class="text-gray-400">{row.language}:</strong> {row.translation}
					</span>
				</li>
			{/each}
		</ul>
		<p class="mt-4 border-t border-gray-900 pt-4 text-[11px] text-gray-600">
			Postgres in Agentuity
		</p>
	</div>
{/if}
