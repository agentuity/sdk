<script lang="ts">
	import { createAPIClient } from '@agentuity/svelte';

	let name = 'World';
	let greeting = '';
	let loading = false;

	const api = createAPIClient();

	async function handleGreet() {
		loading = true;
		try {
			const result = await api.hello.post({ name });
			greeting = result.greeting;
		} catch (error) {
			console.error('Error:', error);
			greeting = 'Error occurred';
		} finally {
			loading = false;
		}
	}
</script>

<div class="container">
	<header>
		<svg
			aria-hidden="true"
			fill="none"
			height="191"
			viewBox="0 0 220 191"
			width="220"
			xmlns="http://www.w3.org/2000/svg"
			class="logo"
		>
			<path
				clip-rule="evenodd"
				d="M220 191H0L31.427 136.5H0L8 122.5H180.5L220 191ZM47.5879 136.5L24.2339 177H195.766L172.412 136.5H47.5879Z"
				fill="#00FFFF"
				fill-rule="evenodd"
			/>
			<path
				clip-rule="evenodd"
				d="M110 0L157.448 82.5H189L197 96.5H54.5L110 0ZM78.7021 82.5L110 28.0811L141.298 82.5H78.7021Z"
				fill="#00FFFF"
				fill-rule="evenodd"
			/>
		</svg>

		<h1>Welcome to Agentuity</h1>
		<p class="subtitle">Svelte Test App</p>
	</header>

	<main>
		<div class="card">
			<label for="name-input">Your name:</label>
			<input
				id="name-input"
				type="text"
				bind:value={name}
				placeholder="Enter your name"
				disabled={loading}
			/>
			<button onclick={() => handleGreet()} disabled={loading}>
				{loading ? 'Loading...' : 'Say Hello'}
			</button>
		</div>

		{#if greeting}
			<div class="result">
				<p>{greeting}</p>
			</div>
		{/if}
	</main>
</div>

<style>
	:global(body) {
		margin: 0;
		font-family:
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			Roboto,
			sans-serif;
		background-color: #09090b;
		color: #fff;
	}

	.container {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-height: 100vh;
		padding: 4rem 2rem;
	}

	header {
		text-align: center;
		margin-bottom: 3rem;
	}

	.logo {
		width: 3rem;
		height: auto;
		margin-bottom: 1rem;
	}

	h1 {
		font-size: 3rem;
		font-weight: 100;
		margin: 0 0 0.5rem 0;
	}

	.subtitle {
		color: #a1a1aa;
		font-size: 1.15rem;
		margin: 0;
	}

	main {
		width: 100%;
		max-width: 32rem;
	}

	.card {
		background-color: #000;
		border: 1px solid #27272a;
		border-radius: 0.5rem;
		padding: 2rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	label {
		color: #a1a1aa;
		font-size: 0.875rem;
	}

	input {
		background-color: #18181b;
		border: 1px solid #27272a;
		border-radius: 0.375rem;
		color: #fff;
		padding: 0.75rem 1rem;
		font-size: 1rem;
	}

	input:focus {
		outline: 2px solid #00ffff;
		outline-offset: 2px;
	}

	input:disabled {
		opacity: 0.5;
	}

	button {
		background: linear-gradient(135deg, #0891b2, #06b6d4);
		border: none;
		border-radius: 0.375rem;
		color: #fff;
		cursor: pointer;
		font-size: 1rem;
		font-weight: 600;
		padding: 0.75rem 1.5rem;
		transition: opacity 0.2s;
	}

	button:hover:not(:disabled) {
		opacity: 0.9;
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.result {
		background-color: #000;
		border: 1px solid #00ffff;
		border-radius: 0.5rem;
		margin-top: 1.5rem;
		padding: 1.5rem;
	}

	.result p {
		color: #00ffff;
		font-size: 1.25rem;
		margin: 0;
		text-align: center;
	}
</style>
