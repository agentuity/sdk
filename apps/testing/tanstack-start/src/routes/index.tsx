import { createFileRoute } from '@tanstack/react-router';
import { type ChangeEvent, useEffect, useState } from 'react';

export const Route = createFileRoute('/')({ component: App });

const LANGUAGES = ['Spanish', 'French', 'German', 'Chinese'] as const;
const MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-nano'] as const;
const DEFAULT_TEXT =
	'Welcome to Agentuity! This translation demo shows what you can build with the platform. It connects to AI models through our gateway — no separate API keys needed. Try translating this text into different languages to see it in action.';

function App() {
	const [text, setText] = useState(DEFAULT_TEXT);
	const [toLanguage, setToLanguage] = useState<(typeof LANGUAGES)[number]>('Spanish');
	const [model, setModel] = useState<(typeof MODELS)[number]>('gpt-4o-mini');
	const [result, setResult] = useState<{
		translation: string;
		tokens: number;
		model: string;
		toLanguage: string;
	} | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [envDebug, setEnvDebug] = useState<Record<string, unknown> | null>(null);

	useEffect(() => {
		fetch('/api/debug-env')
			.then((r) => r.json())
			.then(setEnvDebug)
			.catch(console.error);
	}, []);

	const handleTranslate = async () => {
		setIsLoading(true);
		setError(null);
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
			setResult(await res.json());
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Translation failed');
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="flex min-h-screen justify-center font-sans text-white">
			<div className="flex w-full max-w-3xl flex-col gap-4 p-16">
				{/* Header */}
				<div className="relative mb-8 flex flex-col items-center justify-center gap-2 text-center">
					<svg
						aria-hidden="true"
						className="mb-4 h-auto w-12"
						fill="none"
						height="191"
						viewBox="0 0 220 191"
						width="220"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							clipRule="evenodd"
							d="M220 191H0L31.427 136.5H0L8 122.5H180.5L220 191ZM47.5879 136.5L24.2339 177H195.766L172.412 136.5H47.5879Z"
							fill="var(--color-cyan-500)"
							fillRule="evenodd"
						/>
						<path
							clipRule="evenodd"
							d="M110 0L157.448 82.5H189L197 96.5H54.5L110 0ZM78.7021 82.5L110 28.0811L141.298 82.5H78.7021Z"
							fill="var(--color-cyan-500)"
							fillRule="evenodd"
						/>
					</svg>
					<h1 className="text-5xl font-thin">Welcome to Agentuity</h1>
					<p className="text-lg text-gray-400">
						<span className="font-serif italic">TanStack Start</span> + AI Gateway
					</p>
				</div>

				{/* Translate Form */}
				<div className="flex flex-col gap-6 rounded-lg border border-gray-900 bg-black p-8 text-gray-400 shadow-2xl">
					<div className="flex flex-wrap items-center gap-1.5">
						Translate to
						<select
							className="-mb-0.5 cursor-pointer appearance-none border-0 border-b border-dashed border-gray-700 bg-transparent font-normal text-white outline-none hover:border-b-cyan-400 focus:border-b-cyan-400"
							disabled={isLoading}
							onChange={(e: ChangeEvent<HTMLSelectElement>) =>
								setToLanguage(e.currentTarget.value as (typeof LANGUAGES)[number])
							}
							value={toLanguage}
						>
							{LANGUAGES.map((lang) => (
								<option key={lang} value={lang}>
									{lang}
								</option>
							))}
						</select>
						using
						<select
							className="-mb-0.5 cursor-pointer appearance-none border-0 border-b border-dashed border-gray-700 bg-transparent font-normal text-white outline-none hover:border-b-cyan-400 focus:border-b-cyan-400"
							disabled={isLoading}
							onChange={(e: ChangeEvent<HTMLSelectElement>) =>
								setModel(e.currentTarget.value as (typeof MODELS)[number])
							}
							value={model}
						>
							{MODELS.map((m) => (
								<option key={m} value={m}>
									{m}
								</option>
							))}
						</select>
						<div className="group relative z-0 ml-auto">
							<div className="absolute inset-0 rounded-lg bg-linear-to-r from-cyan-700 via-blue-500 to-purple-600 opacity-75 blur-xl transition-all duration-700 group-hover:opacity-100 group-hover:blur-2xl" />
							<div className="absolute inset-0 rounded-lg bg-cyan-500/50 opacity-50 blur-3xl" />
							<button
								className="relative cursor-pointer rounded-lg bg-gray-950 px-4 py-2 font-semibold text-white shadow-2xl disabled:cursor-not-allowed disabled:opacity-50"
								disabled={isLoading || !text.trim()}
								onClick={handleTranslate}
								type="button"
								data-loading={isLoading}
							>
								{isLoading ? 'Translating' : 'Translate'}
							</button>
						</div>
					</div>

					<textarea
						className="z-10 min-h-28 resize-y rounded-md border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-white focus:outline-2 focus:outline-offset-2 focus:outline-cyan-500"
						disabled={isLoading}
						onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setText(e.currentTarget.value)}
						placeholder="Enter text to translate..."
						rows={4}
						value={text}
					/>

					{/* Translation Result */}
					{error ? (
						<div className="rounded-md border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-400">
							{error}
						</div>
					) : isLoading ? (
						<div
							className="rounded-md border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-gray-600"
							data-loading="true"
						/>
					) : !result?.translation ? (
						<div className="output rounded-md border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-gray-600">
							Translation will appear here
						</div>
					) : (
						<div className="flex flex-col gap-3">
							<div className="output rounded-md border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-cyan-500">
								{result.translation}
							</div>
							<div className="flex gap-4 text-xs text-gray-500">
								{result.tokens > 0 && (
									<span>
										Tokens <strong className="text-gray-400">{result.tokens}</strong>
									</span>
								)}
								<span>
									Model <strong className="text-gray-400">{result.model}</strong>
								</span>
								<span>
									Language <strong className="text-gray-400">{result.toLanguage}</strong>
								</span>
							</div>
						</div>
					)}
				</div>

				{/* Next Steps */}
				<div className="rounded-lg border border-gray-900 bg-black p-8">
					<h3 className="m-0 mb-6 text-xl font-normal leading-none text-white">
						How it works
					</h3>
					<div className="flex flex-col gap-6">
						{[
							{
								title: 'AI Gateway routing',
								text: (
									<>
										<code className="text-white">agentuity dev</code> automatically sets
										OPENAI_API_KEY and OPENAI_BASE_URL so the AI SDK routes through the
										Agentuity gateway.
									</>
								),
							},
							{
								title: 'Server functions',
								text: (
									<>
										Edit <code className="text-white">src/server/translate.ts</code> to
										change the AI model, prompt, or add new server functions.
									</>
								),
							},
							{
								title: 'TanStack Start',
								text: (
									<>
										Add routes in <code className="text-white">src/routes/</code> —
										file-based routing with full SSR support.
									</>
								),
							},
						].map((step) => (
							<div key={step.title} className="flex items-start gap-3">
								<div className="flex size-4 shrink-0 items-center justify-center rounded border border-green-500 bg-green-950">
									<svg
										aria-hidden="true"
										className="size-2.5"
										fill="none"
										height="24"
										stroke="var(--color-green-500)"
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth="2"
										viewBox="0 0 24 24"
										width="24"
										xmlns="http://www.w3.org/2000/svg"
									>
										<path d="M20 6 9 17l-5-5" />
									</svg>
								</div>
								<div>
									<h4 className="-mt-0.5 mb-0.5 text-sm font-normal text-white">
										{step.title}
									</h4>
									<p className="text-xs text-gray-400">{step.text}</p>
								</div>
							</div>
						))}
					</div>
				</div>
				{/* Debug: Server Env */}
				{envDebug && (
					<div className="rounded-lg border border-gray-900 bg-black p-8">
						<h3 className="m-0 mb-4 text-xl font-normal leading-none text-white">
							🔧 Server Environment (debug)
						</h3>
						<pre className="overflow-auto rounded-md bg-gray-950 p-4 text-xs text-gray-400">
							{JSON.stringify(envDebug, null, 2)}
						</pre>
					</div>
				)}
			</div>
		</div>
	);
}
