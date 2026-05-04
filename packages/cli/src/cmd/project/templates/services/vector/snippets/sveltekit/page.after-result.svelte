{#if similar.length > 0}
	<div class="rounded-md border border-gray-900 bg-gray-950 px-4 py-3 text-xs text-gray-400">
		<div class="mb-2 text-gray-500">Similar past translations</div>
		<ul class="flex flex-col gap-1.5">
			{#each similar as hit (hit.key)}
				<li class="flex items-center justify-between gap-3">
					<span class="text-gray-300">{hit.metadata?.translation ?? hit.key}</span>
					<span class="text-gray-600">{hit.similarity.toFixed(3)}</span>
				</li>
			{/each}
		</ul>
	</div>
{/if}
