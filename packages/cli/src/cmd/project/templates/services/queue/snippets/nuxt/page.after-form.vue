<div v-if="jobs.length > 0" class="rounded-lg border border-gray-900 bg-black p-8">
	<div class="mb-6 flex flex-col gap-1">
		<h3 class="m-0 text-xl font-normal leading-none text-white">Queued translations</h3>
		<p class="text-xs text-gray-500">
			Messages published to <code class="text-gray-400">translate-jobs</code>. Add a worker to process them.
		</p>
	</div>
	<ul class="flex flex-col gap-3 text-xs text-gray-400">
		<li
			v-for="job in jobs"
			:key="job.id"
			class="flex flex-col gap-1 rounded-md border border-gray-900 bg-gray-950 px-4 py-3"
		>
			<span class="text-gray-500">
				<strong class="text-cyan-500">queued</strong> · {{ job.id }} · offset {{ job.offset }}
			</span>
			<span class="italic">
				{{ job.text.length > 80 ? `${job.text.slice(0, 80)}…` : job.text }}
				<span class="text-gray-600"> → {{ job.toLanguage }}</span>
			</span>
		</li>
	</ul>
	<p class="mt-4 border-t border-gray-900 pt-4 text-[11px] text-gray-600">
		Queue powered by <code class="text-gray-500">@agentuity/queue</code>
	</p>
</div>
