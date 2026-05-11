<button
	class="cursor-pointer rounded-lg border border-gray-800 bg-gray-950/80 px-3.5 py-2 text-sm font-medium text-gray-300 transition-colors hover:border-cyan-800 hover:bg-cyan-950/20 hover:text-cyan-200 focus:outline-2 focus:outline-offset-2 focus:outline-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
	disabled={isLoading || !text.trim()}
	onclick={handleQueue}
	type="button"
>
	Queue translation
</button>
