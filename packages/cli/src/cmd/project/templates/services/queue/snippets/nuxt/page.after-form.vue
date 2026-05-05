<div v-if="jobs.length > 0" class="rounded-lg border border-gray-900 bg-black p-8">
	<h3 class="m-0 mb-6 text-xl font-normal leading-none text-white">Pending jobs</h3>
	<ul class="flex flex-col gap-3 text-xs text-gray-400">
		<li
			v-for="job in jobs"
			:key="job.id"
			class="flex flex-col gap-0.5 rounded-md border border-gray-900 bg-gray-950 px-4 py-3"
		>
			<span class="text-gray-500">
				<strong class="text-cyan-500">queued</strong> · {{ job.id }}
			</span>
			<span class="italic">
				{{ job.text.length > 80 ? `${job.text.slice(0, 80)}…` : job.text }}
				<span class="text-gray-600"> → {{ job.toLanguage }}</span>
			</span>
		</li>
	</ul>
</div>
