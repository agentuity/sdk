<div
	v-if="similar.length > 0"
	class="rounded-md border border-gray-900 bg-gray-950 px-4 py-3 text-xs text-gray-400"
>
	<div class="mb-2 text-gray-500">Similar past translations</div>
	<ul class="flex flex-col gap-1.5">
		<li
			v-for="hit in similar"
			:key="hit.key"
			class="flex items-center justify-between gap-3"
		>
			<span class="text-gray-300">{{ hit.metadata?.translation ?? hit.key }}</span>
			<span class="text-gray-600">{{ hit.similarity.toFixed(3) }}</span>
		</li>
	</ul>
	<p class="mt-3 border-t border-gray-900 pt-3 text-[11px] text-gray-600">
		Search powered by <code class="text-gray-500">@agentuity/vector</code>
	</p>
</div>
