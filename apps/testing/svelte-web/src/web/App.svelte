<script lang="ts">
	let name = $state('World');
	let greeting = $state('');
	let loading = $state(false);

	async function sayHello() {
		loading = true;
		try {
			const res = await fetch('/api/hello', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name }),
			});
			greeting = await res.text();
		} catch (e) {
			greeting = `Error: ${e}`;
		} finally {
			loading = false;
		}
	}
</script>

<div class="app-container">
	<div class="content-wrapper">
		<h1>Welcome to Agentuity + Svelte</h1>
		<p class="subtitle">Validating non-React framework support</p>

		<div class="card">
			<h2>Try the <span class="highlight">Hello Agent</span></h2>

			<div class="input-group">
				<input
					type="text"
					bind:value={name}
					placeholder="Enter your name"
					disabled={loading}
				/>
				<button onclick={sayHello} disabled={loading}>
					{loading ? 'Running...' : 'Say Hello'}
				</button>
			</div>

			<div class="output" data-loading={!greeting}>
				{greeting || 'Waiting for request'}
			</div>
		</div>
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		background-color: #09090b;
	}

	.app-container {
		background-color: #09090b;
		color: #fff;
		display: flex;
		font-family: system-ui, -apple-system, sans-serif;
		justify-content: center;
		min-height: 100vh;
	}

	.content-wrapper {
		display: flex;
		flex-direction: column;
		gap: 2rem;
		max-width: 48rem;
		padding: 4rem;
		width: 100%;
	}

	h1 {
		font-size: 2.5rem;
		font-weight: 100;
		margin: 0;
		text-align: center;
	}

	.subtitle {
		color: #a1a1aa;
		font-size: 1.15rem;
		margin: 0;
		text-align: center;
	}

	.card {
		background: #000;
		border: 1px solid #18181b;
		border-radius: 0.5rem;
		padding: 2rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	h2 {
		color: #a1a1aa;
		font-size: 1.25rem;
		font-weight: 400;
		margin: 0;
	}

	.highlight {
		color: #ff3e00;
	}

	.input-group {
		display: flex;
		gap: 1rem;
	}

	input {
		background: #09090b;
		border: 1px solid #2b2b30;
		border-radius: 0.375rem;
		color: #fff;
		flex: 1;
		outline: none;
		padding: 0.75rem 1rem;
	}

	button {
		background: #ff3e00;
		border: none;
		border-radius: 0.375rem;
		color: #fff;
		cursor: pointer;
		padding: 0.75rem 1.5rem;
		white-space: nowrap;
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.output {
		background: #09090b;
		border: 1px solid #2b2b30;
		border-radius: 0.375rem;
		color: #ff3e00;
		font-family: monospace;
		line-height: 1.5;
		padding: 0.75rem 1rem;
	}
</style>
