<script lang="ts">
import { enhance } from '$app/forms';

const LANGUAGES = ['Spanish', 'French', 'German', 'Chinese'] as const;
const MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-nano'] as const;
const DEFAULT_TEXT =
	'Welcome to Agentuity! This translation demo shows what you can build with the platform. It connects to AI models through our gateway — no separate API keys needed. Try translating this text into different languages to see it in action.';

let text = $state(DEFAULT_TEXT);
let toLanguage: (typeof LANGUAGES)[number] = $state('Spanish');
let model: (typeof MODELS)[number] = $state('gpt-4o-mini');
let isLoading = $state(false);

let { form } = $props();
</script>

<svelte:head>
	<title>Agentuity + SvelteKit</title>
</svelte:head>

<div class="flex min-h-screen justify-center font-sans text-white">
	<div class="flex w-full max-w-3xl flex-col gap-4 p-16">
		<!-- Header -->
		<div class="relative mb-8 flex flex-col items-center justify-center gap-2 text-center">
			<svg
				aria-hidden="true"
				class="mb-4 h-auto w-12"
				fill="none"
				height="191"
				viewBox="0 0 220 191"
				width="220"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path
					clip-rule="evenodd"
					d="M220 191H0L31.427 136.5H0L8 122.5H180.5L220 191ZM47.5879 136.5L24.2339 177H195.766L172.412 136.5H47.5879Z"
					fill="var(--color-cyan-500)"
					fill-rule="evenodd"
				/>
				<path
					clip-rule="evenodd"
					d="M110 0L157.448 82.5H189L197 96.5H54.5L110 0ZM78.7021 82.5L110 28.0811L141.298 82.5H78.7021Z"
					fill="var(--color-cyan-500)"
					fill-rule="evenodd"
				/>
			</svg>
			<h1 class="text-5xl font-thin">Welcome to Agentuity</h1>
			<p class="text-lg text-gray-400">
				<span class="font-serif italic">SvelteKit</span> + AI Gateway
			</p>
		</div>

		<!-- Translate Form -->
		<form
			class="flex flex-col gap-6 rounded-lg border border-gray-900 bg-black p-8 text-gray-400 shadow-2xl"
			method="POST"
			use:enhance={() => {
				isLoading = true;
				return async ({ update }) => {
					await update();
					isLoading = false;
				};
			}}
		>
			<div class="flex flex-wrap items-center gap-1.5">
				Translate to
				<select
					class="-mb-0.5 cursor-pointer appearance-none border-0 border-b border-dashed border-gray-700 bg-transparent font-normal text-white outline-none hover:border-b-cyan-400 focus:border-b-cyan-400"
					{...isLoading ? { disabled: true } : {}}
					name="toLanguage"
					bind:value={toLanguage}
				>
					{#each LANGUAGES as lang}
						<option value={lang}>{lang}</option>
					{/each}
				</select>
				using
				<select
					class="-mb-0.5 cursor-pointer appearance-none border-0 border-b border-dashed border-gray-700 bg-transparent font-normal text-white outline-none hover:border-b-cyan-400 focus:border-b-cyan-400"
					{...isLoading ? { disabled: true } : {}}
					name="model"
					bind:value={model}
				>
					{#each MODELS as m}
						<option value={m}>{m}</option>
					{/each}
				</select>
				<div class="group relative z-0 ml-auto">
					<div
						class="absolute inset-0 rounded-lg bg-linear-to-r from-cyan-700 via-blue-500 to-purple-600 opacity-75 blur-xl transition-all duration-700 group-hover:opacity-100 group-hover:blur-2xl"
					/>
					<div class="absolute inset-0 rounded-lg bg-cyan-500/50 opacity-50 blur-3xl" />
					<button
						class="relative cursor-pointer rounded-lg bg-gray-950 px-4 py-2 font-semibold text-white shadow-2xl disabled:cursor-not-allowed disabled:opacity-50"
						disabled={isLoading || !text.trim()}
						type="submit"
						data-loading={isLoading}
					>
						{isLoading ? 'Translating' : 'Translate'}
					</button>
				</div>
			</div>

			<input type="hidden" name="text" bind:value={text} />
			<textarea
				class="z-10 min-h-28 resize-y rounded-md border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-white focus:outline-2 focus:outline-offset-2 focus:outline-cyan-500"
				disabled={isLoading}
				bind:value={text}
				placeholder="Enter text to translate..."
				rows="4"
				name="textDisplay"
				oninput={() => { text = (event?.target as HTMLTextAreaElement)?.value ?? text; }}
			/>

			<!-- Translation Result -->
			{#if form?.error}
				<div
					class="rounded-md border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-400"
				>
					{form.error.message ?? 'Translation failed'}
				</div>
			{:else if isLoading}
				<div
					class="rounded-md border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-gray-600"
					data-loading="true"
				/>
			{:else if !form?.translation}
				<div
					class="output rounded-md border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-gray-600"
				>
					Translation will appear here
				</div>
			{:else}
				<div class="flex flex-col gap-3">
					<div
						class="output rounded-md border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-cyan-500"
					>
						{form.translation}
					</div>
					<div class="flex gap-4 text-xs text-gray-500">
						{#if form.tokens > 0}
							<span>
								Tokens <strong class="text-gray-400">{form.tokens}</strong>
							</span>
						{/if}
						<span>
							Model <strong class="text-gray-400">{form.model}</strong>
						</span>
						<span>
							Language <strong class="text-gray-400">{form.toLanguage}</strong>
						</span>
					</div>
				</div>
			{/if}
		</form>

		<!-- How it works -->
		<div class="rounded-lg border border-gray-900 bg-black p-8">
			<h3 class="m-0 mb-6 text-xl font-normal leading-none text-white">How it works</h3>
			<div class="flex flex-col gap-6">
				{#each [
					{
						title: 'AI Gateway routing',
						text: '`agentuity dev` automatically sets OPENAI_API_KEY and OPENAI_BASE_URL so the AI SDK routes through the Agentuity gateway.',
					},
					{
						title: 'Form actions',
						text: 'Edit `src/routes/+page.server.ts` to change the AI model, prompt, or add new actions.',
					},
					{
						title: 'SvelteKit',
						text: 'Add routes in `src/routes/` — file-based routing with SSR and form actions.',
					},
				] as step}
					<div class="flex items-start gap-3">
						<div
							class="flex size-4 shrink-0 items-center justify-center rounded border border-green-500 bg-green-950"
						>
							<svg
								aria-hidden="true"
								class="size-2.5"
								fill="none"
								height="24"
								stroke="var(--color-green-500)"
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								viewBox="0 0 24 24"
								width="24"
								xmlns="http://www.w3.org/2000/svg"
							>
								<path d="M20 6 9 17l-5-5" />
							</svg>
						</div>
						<div>
							<h4 class="-mt-0.5 mb-0.5 text-sm font-normal text-white">{step.title}</h4>
							<p class="text-xs text-gray-400">{step.text}</p>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
</div>
