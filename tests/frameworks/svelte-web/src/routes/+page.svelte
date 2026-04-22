<script lang="ts">
	const LANGUAGES = ['Spanish', 'French', 'German', 'Chinese'] as const;
	const MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-nano'] as const;
	const DEFAULT_TEXT =
		'Welcome to Agentuity! This translation demo shows what you can build with the platform. It connects to AI models through our gateway — no separate API keys needed. Try translating this text into different languages to see it in action.';

	type Language = (typeof LANGUAGES)[number];
	type Model = (typeof MODELS)[number];
	type Result = {
		translation: string;
		tokens: number;
		model: string;
		toLanguage: string;
	};

	let text = $state(DEFAULT_TEXT);
	let toLanguage = $state<Language>('Spanish');
	let model = $state<Model>('gpt-4o-mini');
	let result = $state<Result | null>(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	async function handleTranslate() {
		isLoading = true;
		error = null;
		try {
			const res = await fetch('/api/translate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text, toLanguage, model }),
			});
			if (!res.ok) {
				const errBody = await res.text();
				throw new Error(`API error ${res.status}: ${errBody}`);
			}
			result = (await res.json()) as Result;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Translation failed';
		} finally {
			isLoading = false;
		}
	}
</script>

<main class="page">
	<header class="header">
		<svg
			aria-hidden="true"
			class="logo"
			fill="none"
			viewBox="0 0 220 191"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				clip-rule="evenodd"
				d="M220 191H0L31.427 136.5H0L8 122.5H180.5L220 191ZM47.5879 136.5L24.2339 177H195.766L172.412 136.5H47.5879Z"
				fill="currentColor"
				fill-rule="evenodd"
			/>
			<path
				clip-rule="evenodd"
				d="M110 0L157.448 82.5H189L197 96.5H54.5L110 0ZM78.7021 82.5L110 28.0811L141.298 82.5H78.7021Z"
				fill="currentColor"
				fill-rule="evenodd"
			/>
		</svg>
		<h1>Welcome to Agentuity</h1>
		<p class="subtitle"><em>SvelteKit</em> + AI Gateway</p>
	</header>

	<section class="card">
		<div class="controls">
			<span>Translate to</span>
			<select bind:value={toLanguage} disabled={isLoading}>
				{#each LANGUAGES as lang (lang)}
					<option value={lang}>{lang}</option>
				{/each}
			</select>
			<span>using</span>
			<select bind:value={model} disabled={isLoading}>
				{#each MODELS as m (m)}
					<option value={m}>{m}</option>
				{/each}
			</select>
			<button
				type="button"
				class="translate-btn"
				data-loading={isLoading}
				disabled={isLoading || !text.trim()}
				onclick={handleTranslate}
			>
				{isLoading ? 'Translating' : 'Translate'}
			</button>
		</div>

		<textarea
			bind:value={text}
			disabled={isLoading}
			placeholder="Enter text to translate..."
			rows="4"
		></textarea>

		{#if error}
			<div class="error">{error}</div>
		{:else if isLoading}
			<div class="placeholder" data-loading="true"></div>
		{:else if !result?.translation}
			<div class="output placeholder">Translation will appear here</div>
		{:else}
			<div class="output result">{result.translation}</div>
			<div class="meta">
				{#if result.tokens > 0}
					<span>Tokens <strong>{result.tokens}</strong></span>
				{/if}
				<span>Model <strong>{result.model}</strong></span>
				<span>Language <strong>{result.toLanguage}</strong></span>
			</div>
		{/if}
	</section>

	<section class="card info">
		<h3>How it works</h3>
		<ul>
			<li>
				<strong>AI Gateway routing</strong> —
				<code>agentuity dev</code> injects <code>OPENAI_API_KEY</code> and
				<code>OPENAI_BASE_URL</code> so the AI SDK routes through the Agentuity gateway.
			</li>
			<li>
				<strong>Server endpoints</strong> — edit
				<code>src/routes/api/translate/+server.ts</code> to change the model or prompt.
			</li>
			<li>
				<strong>SvelteKit</strong> — add routes under <code>src/routes/</code> using
				file-based routing with full SSR support.
			</li>
		</ul>
	</section>
</main>

<style>
	:global(body) {
		margin: 0;
		background: #000;
		color: #fff;
		font-family: system-ui, -apple-system, sans-serif;
	}

	.page {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 48rem;
		margin: 0 auto;
		padding: 4rem 1.5rem;
	}

	.header {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		text-align: center;
		margin-bottom: 1.5rem;
		color: #06b6d4;
	}

	.logo {
		width: 3rem;
		height: auto;
		margin-bottom: 0.5rem;
	}

	h1 {
		font-size: 3rem;
		font-weight: 200;
		color: #fff;
		margin: 0;
	}

	.subtitle {
		color: #9ca3af;
		margin: 0;
	}

	.subtitle em {
		font-style: italic;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding: 2rem;
		background: #000;
		border: 1px solid #1f2937;
		border-radius: 0.5rem;
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		color: #9ca3af;
	}

	.controls select {
		appearance: none;
		background: transparent;
		color: #fff;
		border: 0;
		border-bottom: 1px dashed #374151;
		cursor: pointer;
		padding: 0 0.25rem 0.125rem;
	}

	.controls select:hover,
	.controls select:focus {
		border-bottom-color: #22d3ee;
		outline: none;
	}

	.translate-btn {
		margin-left: auto;
		padding: 0.5rem 1rem;
		background: #0a0a0a;
		color: #fff;
		border: 1px solid #22d3ee;
		border-radius: 0.5rem;
		font-weight: 600;
		cursor: pointer;
	}

	.translate-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	textarea {
		min-height: 7rem;
		resize: vertical;
		padding: 0.75rem 1rem;
		background: #0a0a0a;
		color: #fff;
		border: 1px solid #1f2937;
		border-radius: 0.375rem;
		font-family: inherit;
		font-size: 0.875rem;
	}

	textarea:focus {
		outline: 2px solid #06b6d4;
		outline-offset: 2px;
	}

	.output,
	.placeholder,
	.error {
		padding: 0.75rem 1rem;
		border-radius: 0.375rem;
		border: 1px solid #1f2937;
		background: #0a0a0a;
		font-size: 0.875rem;
	}

	.placeholder {
		color: #4b5563;
		min-height: 1.25rem;
	}

	.result {
		color: #06b6d4;
	}

	.error {
		border-color: #7f1d1d;
		background: #450a0a;
		color: #f87171;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		font-size: 0.75rem;
		color: #6b7280;
	}

	.meta strong {
		color: #9ca3af;
		font-weight: 600;
	}

	.info h3 {
		margin: 0 0 0.5rem;
		font-size: 1.25rem;
		font-weight: 400;
	}

	.info ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		color: #9ca3af;
		font-size: 0.875rem;
	}

	.info code {
		color: #fff;
		font-family: ui-monospace, monospace;
	}
</style>
