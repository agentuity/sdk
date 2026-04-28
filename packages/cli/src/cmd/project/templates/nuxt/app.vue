<script setup lang="ts">
const LANGUAGES = ['Spanish', 'French', 'German', 'Chinese'] as const;
const MODELS = [
	{ value: 'gpt-5.4-nano', label: 'GPT-5.4 Nano' },
	{ value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
	{ value: 'gpt-5.4', label: 'GPT-5.4' },
] as const;
const DEFAULT_TEXT =
	'Welcome to Agentuity! This starter app translates text, stores recent requests in key-value storage, and shows how a typed framework route can call models through Agentuity’s AI Gateway. Try a few languages or switch models, then check the app session, model, and token details below.';

interface HistoryEntry {
	readonly model: string;
	readonly sessionId: string;
	readonly text: string;
	readonly timestamp: string;
	readonly tokens: number;
	readonly toLanguage: string;
	readonly translation: string;
}

interface HistoryData {
	readonly history: readonly HistoryEntry[];
	readonly sessionId: string;
	readonly translationCount: number;
}

interface TranslateResult extends HistoryData {
	readonly model: string;
	readonly toLanguage: string;
	readonly tokens: number;
	readonly translation: string;
}

const text = ref(DEFAULT_TEXT);
const toLanguage = ref<(typeof LANGUAGES)[number]>('Spanish');
const model = ref<(typeof MODELS)[number]['value']>('gpt-5.4-nano');

const { data: historyData } = await useFetch<HistoryData>('/api/translate');

const {
	data: result,
	error,
	status,
	execute: executeTranslate,
} = useFetch<TranslateResult>('/api/translate', {
	method: 'POST',
	body: computed(() => ({ text: text.value, toLanguage: toLanguage.value, model: model.value })),
	immediate: false,
	watch: false,
});

const isLoading = computed(() => status.value === 'pending');
const currentHistory = computed(() => result.value ?? historyData.value);
const history = computed(() => currentHistory.value?.history ?? []);

async function handleTranslate(): Promise<void> {
	await executeTranslate();
	if (result.value) {
		historyData.value = result.value;
	}
}

async function handleClearHistory(): Promise<void> {
	const next = await $fetch<HistoryData>('/api/translate', { method: 'DELETE' });
	result.value = null;
	historyData.value = next;
}
</script>

<template>
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
				<h1 class="text-5xl font-thin">
					Welcome to
					<a
						class="text-white transition-colors hover:text-cyan-400"
						href="https://agentuity.com"
						rel="noreferrer"
						target="_blank"
					>
						Agentuity
					</a>
				</h1>
				<p class="text-lg text-gray-400">
					The <span class="font-serif italic">Full-Stack</span> Platform for AI Agents
				</p>
			</div>

			<!-- Translate Form -->
			<div
				class="flex flex-col gap-6 rounded-lg border border-gray-900 bg-black p-8 text-gray-400 shadow-2xl"
			>
				<div class="flex flex-wrap items-center gap-1.5">
					Translate to
					<select
						class="-mb-0.5 cursor-pointer appearance-none border-0 border-b border-dashed border-gray-700 bg-transparent font-normal text-white outline-none hover:border-b-cyan-400 focus:border-b-cyan-400"
						:disabled="isLoading"
						v-model="toLanguage"
					>
						<option v-for="lang in LANGUAGES" :key="lang" :value="lang">{{ lang }}</option>
					</select>
					using
					<select
						class="-mb-0.5 cursor-pointer appearance-none border-0 border-b border-dashed border-gray-700 bg-transparent font-normal text-white outline-none hover:border-b-cyan-400 focus:border-b-cyan-400"
						:disabled="isLoading"
						v-model="model"
					>
						<option v-for="m in MODELS" :key="m.value" :value="m.value">{{ m.label }}</option>
					</select>
					<div class="group relative z-0 ml-auto">
						<div
							class="absolute inset-0 rounded-lg bg-linear-to-r from-cyan-700 via-blue-500 to-purple-600 opacity-75 blur-xl transition-all duration-700 group-hover:opacity-100 group-hover:blur-2xl"
						/>
						<div class="absolute inset-0 rounded-lg bg-cyan-500/50 opacity-50 blur-3xl" />
						<button
							class="relative cursor-pointer rounded-lg bg-gray-950 px-4 py-2 font-semibold text-white shadow-2xl disabled:cursor-not-allowed disabled:opacity-50"
							:disabled="isLoading || !text.trim()"
							@click="handleTranslate()"
							type="button"
							:data-loading="isLoading"
						>
							{{ isLoading ? 'Translating' : 'Translate' }}
						</button>
					</div>
				</div>

				<textarea
					class="z-10 min-h-28 resize-y rounded-md border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-white focus:outline-2 focus:outline-offset-2 focus:outline-cyan-500"
					:disabled="isLoading"
					v-model="text"
					placeholder="Enter text to translate..."
					rows="4"
				/>

				<!-- Translation Result -->
				<div
					v-if="error"
					class="rounded-md border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-400"
				>
					{{ error.message }}
				</div>
				<div
					v-else-if="isLoading"
					class="rounded-md border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-gray-600"
					data-loading="true"
				/>
				<div
					v-else-if="!result?.translation"
					class="output rounded-md border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-gray-600"
				>
					Translation will appear here
				</div>
				<template v-else>
					<div class="flex flex-col gap-3">
						<div
							class="output rounded-md border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-cyan-500"
						>
							{{ result.translation }}
						</div>
						<div class="flex gap-4 text-xs text-gray-500">
							<span v-if="result.tokens > 0">
								Tokens <strong class="text-gray-400">{{ result.tokens }}</strong>
							</span>
							<span>
								Model <strong class="text-gray-400">{{ result.model }}</strong>
							</span>
							<span>
								Language
								<strong class="text-gray-400">{{ result.toLanguage }}</strong>
							</span>
							<span>
								App session
								<strong class="text-gray-400">{{ result.sessionId.slice(0, 12) }}...</strong>
							</span>
						</div>
					</div>
				</template>
			</div>

			<!-- Recent History -->
			<div class="flex flex-col gap-6 rounded-lg border border-gray-900 bg-black p-8">
				<div class="flex items-center justify-between">
					<h3 class="text-xl font-normal text-white">Recent translations</h3>
					<button
						v-if="history.length > 0"
						class="rounded border border-gray-900 bg-transparent px-3 py-1.5 text-xs text-gray-500 transition-all duration-200 hover:border-gray-700 hover:bg-gray-900 hover:text-white"
						@click="handleClearHistory()"
						type="button"
					>
						Clear
					</button>
				</div>
				<div class="rounded-md bg-gray-950">
					<div
						v-for="entry in [...history].reverse()"
						:key="`${entry.timestamp}-${entry.sessionId}`"
						class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-3 rounded px-3 py-2 text-xs"
					>
						<span class="truncate text-gray-400">{{ entry.text }}</span>
						<span class="text-gray-700">→</span>
						<span class="truncate text-gray-400">{{ entry.translation }}</span>
						<span class="rounded border border-gray-800 bg-gray-900 px-1 py-0.5 text-gray-400">
							{{ entry.toLanguage }}
						</span>
					</div>
					<div v-if="history.length === 0" class="px-3 py-2 text-sm text-gray-600">
						History will appear here
					</div>
				</div>
				<div v-if="currentHistory" class="flex gap-4 text-xs text-gray-500">
					<span>
						App session
						<strong class="text-gray-400">{{ currentHistory.sessionId.slice(0, 12) }}...</strong>
					</span>
					<span>
						Translations <strong class="text-gray-400">{{ currentHistory.translationCount }}</strong>
					</span>
				</div>
			</div>

			<!-- How it works -->
			<div class="rounded-lg border border-gray-900 bg-black p-8">
				<h3 class="m-0 mb-6 text-xl font-normal leading-none text-white">How it works</h3>
				<div class="flex flex-col gap-6">
					<div v-for="step in [
						{
							title: 'Key-value history',
							text: '`KeyValueClient` stores recent translations for this browser session.',
						},
						{
							title: 'AI Gateway routing',
							text: '`agentuity dev` automatically sets OPENAI_API_KEY and OPENAI_BASE_URL so the OpenAI SDK routes through Agentuity\'s AI Gateway.',
						},
						{
							title: 'Server routes',
							text: 'Edit `server/api/translate.ts` to change the AI model, prompt, or add new server routes.',
						},
						{
							title: 'Nuxt',
							text: 'Add pages in `pages/` and server routes in `server/api/` — full-stack Vue framework with SSR.',
						},
					]" :key="step.title" class="flex items-start gap-3">
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
							<h4 class="-mt-0.5 mb-0.5 text-sm font-normal text-white">{{ step.title }}</h4>
							<p class="text-xs text-gray-400">{{ step.text }}</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>
