<button
	class="cursor-pointer rounded-lg border border-gray-700 bg-gray-950 px-4 py-2 font-medium text-gray-300 hover:border-cyan-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
	:disabled="isLoading || !text.trim()"
	@click="handleQueue()"
	type="button"
>
	Translate later
</button>
