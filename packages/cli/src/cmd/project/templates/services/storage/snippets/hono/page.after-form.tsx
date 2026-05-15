<div class="flex flex-col gap-4 rounded-lg border border-gray-900 bg-black p-6 text-xs text-gray-400">
	<div class="flex items-center justify-between gap-3">
		<span>Export translation history as JSON</span>
		<div class="flex items-center gap-3">
			<span id="export-info" class="text-cyan-500"></span>
			<button
				id="export-btn"
				class="cursor-pointer rounded-lg border border-gray-700 bg-gray-950 px-4 py-2 font-medium text-gray-300 hover:border-cyan-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
				type="button"
			>
				Export history
			</button>
		</div>
	</div>
	<p class="border-t border-gray-900 pt-4 text-[11px] text-gray-600">
		Storage powered by <code class="text-gray-500">@agentuity/storage</code>
	</p>
</div>
