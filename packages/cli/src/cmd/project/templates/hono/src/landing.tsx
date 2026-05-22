const clientScript = String.raw`
const btn = document.getElementById('translate-btn');
const textInput = document.getElementById('text-input');
const toLangSelect = document.getElementById('toLanguage');
const modelSelect = document.getElementById('model');
const resultDiv = document.getElementById('result');

btn.addEventListener('click', async () => {
	const text = textInput.value;
	const toLanguage = toLangSelect.value;
	const model = modelSelect.value;
	btn.textContent = 'Translating';
	btn.dataset.loading = 'true';
	btn.disabled = true;
	resultDiv.textContent = '';
	resultDiv.dataset.loading = 'true';
	resultDiv.className = 'rounded-md border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-gray-600';
	try {
		const res = await fetch('/api/translate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ text, toLanguage, model }),
		});
		if (!res.ok) throw new Error('API error ' + res.status);
		const data = await res.json();

		resultDiv.className = 'output rounded-md border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-cyan-500';
		resultDiv.innerHTML = data.translation + '<div class="flex gap-4 text-xs text-gray-500 mt-3">' + (data.tokens > 0 ? '<span>Tokens <strong class="text-gray-400">' + data.tokens + '</strong></span>' : '') + '<span>Model <strong class="text-gray-400">' + data.model + '</strong></span><span>Language <strong class="text-gray-400">' + data.toLanguage + '</strong></span></div>';
	} catch (err) {
		resultDiv.className = 'rounded-md border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-400';
		resultDiv.textContent = err.message || 'Translation failed';
	} finally {
		delete btn.dataset.loading;
		delete resultDiv.dataset.loading;
		btn.textContent = 'Translate';
		btn.disabled = false;
	}
});
`;

const style = String.raw`
:root {
	--color-cyan-50: oklch(0.9812 0.027 196.72);
	--color-cyan-100: oklch(0.965 0.0516 196.33);
	--color-cyan-200: oklch(0.938 0.0956 195.64);
	--color-cyan-300: oklch(0.9193 0.1285 195.15);
	--color-cyan-400: oklch(0.9089 0.1478 194.87);
	--color-cyan-500: oklch(0.9054 0.15455 194.769);
	--color-cyan-600: oklch(0.7653 0.1306 194.77);
	--color-cyan-700: oklch(0.6183 0.10555 194.769);
	--color-cyan-800: oklch(0.462 0.078864 194.769);
	--color-cyan-900: oklch(0.2907 0.0496 194.77);
	--color-cyan-950: oklch(0.1932 0.033 194.77);
	--color-gray-300: oklch(0.871 0.006 286.286);
	--color-gray-400: oklch(0.705 0.015 286.067);
	--color-gray-500: oklch(0.552 0.016 285.938);
	--color-gray-600: oklch(0.442 0.017 285.786);
	--color-gray-700: oklch(0.37 0.013 285.805);
	--color-gray-800: oklch(0.274 0.006 286.033);
	--color-gray-900: oklch(0.21 0.006 285.885);
	--color-gray-950: oklch(0.141 0.005 285.823);
	--color-green-500: oklch(0.723 0.219 149.579);
	--color-green-950: oklch(0.171 0.052 150.3);
	--color-red-400: oklch(0.704 0.191 22.216);
	--color-red-800: oklch(0.395 0.141 25.723);
	--color-red-950: oklch(0.258 0.092 26.042);
	--color-blue-500: oklch(0.623 0.214 259.815);
	--color-purple-600: oklch(0.558 0.288 302.321);
}
* { box-sizing: border-box; }
body {
	background-color: var(--color-gray-950);
	font-family: system-ui, -apple-system, sans-serif;
	margin: 0;
}
code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
select option { background: var(--color-gray-950); color: white; }
[data-loading='true']::after {
	animation: ellipsis 1.5s steps(4, end) infinite;
	content: '.';
	display: inline-block;
	text-align: left;
	width: 1rem;
}
@keyframes ellipsis {
	0% { content: '.'; }
	25% { content: '..'; }
	50% { content: '...'; }
	75% { content: ''; }
}
.flex { display: flex; }
.inline-block { display: inline-block; }
.min-h-screen { min-height: 100vh; }
.w-full { width: 100%; }
.w-12 { width: 3rem; }
.h-auto { height: auto; }
.size-4 { height: 1rem; width: 1rem; }
.size-2\.5 { height: 0.625rem; width: 0.625rem; }
.max-w-3xl { max-width: 48rem; }
.shrink-0 { flex-shrink: 0; }
.flex-col { flex-direction: column; }
.flex-wrap { flex-wrap: wrap; }
.items-center { align-items: center; }
.items-start { align-items: flex-start; }
.justify-center { justify-content: center; }
.justify-between { justify-content: space-between; }
.gap-0\.5 { gap: 0.125rem; }
.gap-1 { gap: 0.25rem; }
.gap-1\.5 { gap: 0.375rem; }
.gap-2 { gap: 0.5rem; }
.gap-3 { gap: 0.75rem; }
.gap-4 { gap: 1rem; }
.gap-6 { gap: 1.5rem; }
.relative { position: relative; }
.absolute { position: absolute; }
.inset-0 { inset: 0; }
.z-0 { z-index: 0; }
.z-10 { z-index: 10; }
.ml-auto { margin-left: auto; }
.-mt-0\.5 { margin-top: -0.125rem; }
.-mb-0\.5 { margin-bottom: -0.125rem; }
.m-0 { margin: 0; }
.mt-3 { margin-top: 0.75rem; }
.mt-4 { margin-top: 1rem; }
.mb-0\.5 { margin-bottom: 0.125rem; }
.mb-2 { margin-bottom: 0.5rem; }
.mb-4 { margin-bottom: 1rem; }
.mb-6 { margin-bottom: 1.5rem; }
.mb-8 { margin-bottom: 2rem; }
.p-6 { padding: 1.5rem; }
.p-8 { padding: 2rem; }
.p-16 { padding: 4rem; }
.px-3\.5 { padding-left: 0.875rem; padding-right: 0.875rem; }
.px-4 { padding-left: 1rem; padding-right: 1rem; }
.py-2 { padding-bottom: 0.5rem; padding-top: 0.5rem; }
.py-3 { padding-bottom: 0.75rem; padding-top: 0.75rem; }
.pt-3 { padding-top: 0.75rem; }
.pt-4 { padding-top: 1rem; }
.min-h-28 { min-height: 7rem; }
.resize-y { resize: vertical; }
.cursor-pointer { cursor: pointer; }
.appearance-none { appearance: none; }
.rounded { border-radius: 0.25rem; }
.rounded-md { border-radius: 0.375rem; }
.rounded-lg { border-radius: 0.5rem; }
.border { border-style: solid; border-width: 1px; }
.border-0 { border-width: 0; }
.border-b { border-bottom-style: solid; border-bottom-width: 1px; }
.border-t { border-top-style: solid; border-top-width: 1px; }
.border-dashed { border-style: dashed; }
.border-gray-700 { border-color: var(--color-gray-700); }
.border-gray-800 { border-color: var(--color-gray-800); }
.border-gray-900 { border-color: var(--color-gray-900); }
.border-green-500 { border-color: var(--color-green-500); }
.border-red-800 { border-color: var(--color-red-800); }
.bg-transparent { background-color: transparent; }
.bg-black { background-color: black; }
.bg-gray-950 { background-color: var(--color-gray-950); }
.bg-gray-950\/80 { background-color: color-mix(in oklch, var(--color-gray-950) 80%, transparent); }
.bg-green-950 { background-color: var(--color-green-950); }
.bg-red-950 { background-color: var(--color-red-950); }
.bg-cyan-500\/50 { background-color: color-mix(in oklch, var(--color-cyan-500) 50%, transparent); }
.bg-cyan-950\/20 { background-color: color-mix(in oklch, var(--color-cyan-950) 20%, transparent); }
.bg-linear-to-r { background-image: linear-gradient(to right, var(--gradient-from), var(--gradient-via), var(--gradient-to)); }
.from-cyan-700 { --gradient-from: var(--color-cyan-700); }
.via-blue-500 { --gradient-via: var(--color-blue-500); }
.to-purple-600 { --gradient-to: var(--color-purple-600); }
.font-sans { font-family: system-ui, -apple-system, sans-serif; }
.font-serif { font-family: Georgia, Cambria, 'Times New Roman', Times, serif; }
.text-center { text-align: center; }
.text-\[11px\] { font-size: 11px; }
.text-xs { font-size: 0.75rem; line-height: 1rem; }
.text-sm { font-size: 0.875rem; line-height: 1.25rem; }
.text-lg { font-size: 1.125rem; line-height: 1.75rem; }
.text-xl { font-size: 1.25rem; line-height: 1.75rem; }
.text-5xl { font-size: 3rem; line-height: 1; }
.font-thin { font-weight: 100; }
.font-normal { font-weight: 400; }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.italic { font-style: italic; }
.leading-none { line-height: 1; }
.text-white { color: white; }
.text-gray-300 { color: var(--color-gray-300); }
.text-gray-400 { color: var(--color-gray-400); }
.text-gray-500 { color: var(--color-gray-500); }
.text-gray-600 { color: var(--color-gray-600); }
.text-cyan-200 { color: var(--color-cyan-200); }
.text-cyan-500 { color: var(--color-cyan-500); }
.text-red-400 { color: var(--color-red-400); }
.opacity-50 { opacity: 0.5; }
.opacity-75 { opacity: 0.75; }
.shadow-2xl { box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25); }
.blur-xl { filter: blur(24px); }
.blur-2xl { filter: blur(40px); }
.blur-3xl { filter: blur(64px); }
.outline-none { outline: 2px solid transparent; outline-offset: 2px; }
.transition-all { transition-duration: 700ms; transition-property: all; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
.transition-colors { transition-duration: 150ms; transition-property: color, background-color, border-color, text-decoration-color, fill, stroke; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
.duration-700 { transition-duration: 700ms; }
.hover\:border-b-cyan-400:hover { border-bottom-color: var(--color-cyan-400); }
.hover\:border-cyan-700:hover { border-color: var(--color-cyan-700); }
.hover\:border-cyan-800:hover { border-color: var(--color-cyan-800); }
.hover\:bg-cyan-950\/20:hover { background-color: color-mix(in oklch, var(--color-cyan-950) 20%, transparent); }
.hover\:text-white:hover { color: white; }
.hover\:text-cyan-200:hover { color: var(--color-cyan-200); }
.focus\:border-b-cyan-400:focus { border-bottom-color: var(--color-cyan-400); }
.focus\:outline-2:focus { outline-style: solid; outline-width: 2px; }
.focus\:outline-offset-2:focus { outline-offset: 2px; }
.focus\:outline-cyan-500:focus { outline-color: var(--color-cyan-500); }
.disabled\:cursor-not-allowed:disabled { cursor: not-allowed; }
.disabled\:opacity-50:disabled { opacity: 0.5; }
.group:hover .group-hover\:opacity-100 { opacity: 1; }
.group:hover .group-hover\:blur-2xl { filter: blur(40px); }
`;

function CheckIcon() {
	return (
		<div class="flex size-4 shrink-0 items-center justify-center rounded border border-green-500 bg-green-950">
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
	);
}

function HowItWorksItem(props: { title: string; children: string }) {
	return (
		<div class="flex items-start gap-3">
			<CheckIcon />
			<div>
				<h4 class="-mt-0.5 mb-0.5 text-sm font-normal text-white">{props.title}</h4>
				<p class="text-xs text-gray-400">{props.children}</p>
			</div>
		</div>
	);
}

export function LandingPage() {
	return (
		<html lang="en">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>Agentuity + Hono</title>
				<style dangerouslySetInnerHTML={{ __html: style }} />
			</head>
			<body>
				<div class="flex min-h-screen justify-center font-sans text-white">
					<div class="flex w-full max-w-3xl flex-col gap-4 p-16">
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
								<span class="font-serif italic">Hono</span> + AI Gateway
							</p>
						</div>

						<div class="flex flex-col gap-6 rounded-lg border border-gray-900 bg-black p-8 text-gray-400 shadow-2xl">
							<div class="flex flex-wrap items-center gap-1.5">
								Translate to
								<select
									id="toLanguage"
									class="-mb-0.5 cursor-pointer appearance-none border-0 border-b border-dashed border-gray-700 bg-transparent font-normal text-white outline-none hover:border-b-cyan-400 focus:border-b-cyan-400"
								>
									<option value="Spanish">Spanish</option>
									<option value="French">French</option>
									<option value="German">German</option>
									<option value="Chinese">Chinese</option>
								</select>
								using
								<select
									id="model"
									class="-mb-0.5 cursor-pointer appearance-none border-0 border-b border-dashed border-gray-700 bg-transparent font-normal text-white outline-none hover:border-b-cyan-400 focus:border-b-cyan-400"
								>
									<option value="openai/gpt-4o-mini">openai/gpt-4o-mini</option>
									<option value="openai/gpt-4o">openai/gpt-4o</option>
									<option value="openai/gpt-4.1-nano">openai/gpt-4.1-nano</option>
								</select>
								<div class="ml-auto flex items-center gap-2">
													<div class="group relative z-0">
										<div class="absolute inset-0 rounded-lg bg-linear-to-r from-cyan-700 via-blue-500 to-purple-600 opacity-75 blur-xl transition-all duration-700 group-hover:opacity-100 group-hover:blur-2xl" />
										<div class="absolute inset-0 rounded-lg bg-cyan-500/50 opacity-50 blur-3xl" />
										<button
											id="translate-btn"
											class="relative cursor-pointer rounded-lg bg-gray-950 px-4 py-2 font-semibold text-white shadow-2xl disabled:cursor-not-allowed disabled:opacity-50"
											type="button"
										>
											Translate
										</button>
									</div>
								</div>
							</div>

							<textarea
								id="text-input"
								class="z-10 min-h-28 resize-y rounded-md border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-white focus:outline-2 focus:outline-offset-2 focus:outline-cyan-500"
								placeholder="Enter text to translate..."
								rows={4}
							>
								Welcome to Agentuity! This translation demo shows what you can build with the platform. It connects to AI models through our gateway — no separate API keys needed. Try translating this text into different languages to see it in action.
							</textarea>
							<div
								id="result"
								class="output rounded-md border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-gray-600"
							>
								Translation will appear here
							</div>
										<p class="border-t border-gray-900 pt-4 text-[11px] text-gray-600">
								Translation powered by <code class="text-gray-500">@agentuity/aigateway</code>
							</p>
						</div>

									<div class="rounded-lg border border-gray-900 bg-black p-8">
							<h3 class="m-0 mb-6 text-xl font-normal leading-none text-white">How it works</h3>
							<div class="flex flex-col gap-6">
								<HowItWorksItem title="AI Gateway routing">
									@agentuity/aigateway uses your project's AGENTUITY_SDK_KEY and sends requests through the Agentuity AI Gateway.
								</HowItWorksItem>
								<HowItWorksItem title="API routes">
									Edit src/index.ts to change the AI model, prompt, or add new routes.
								</HowItWorksItem>
								<HowItWorksItem title="Hono JSX">
									This page is rendered with Hono JSX and served directly from src/index.ts.
								</HowItWorksItem>
							</div>
						</div>
					</div>
				</div>

				{/* @agentuity:services-checklist */}
				<script dangerouslySetInnerHTML={{ __html: clientScript }} />
			</body>
		</html>
	);
}
