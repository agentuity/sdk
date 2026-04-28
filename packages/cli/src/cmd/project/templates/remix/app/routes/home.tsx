import type { ChangeEvent } from 'react';
import { useEffect, useState } from 'react';
import type { Route } from './+types/home';

export function meta({}: Route.MetaArgs) {
	return [
		{ title: 'Agentuity + React Router' },
		{ name: 'description', content: 'AI translation starter with Agentuity' },
	];
}

const LANGUAGES = ['Spanish', 'French', 'German', 'Chinese'] as const;
const MODELS = ['gpt-5.4-nano', 'gpt-5.4-mini', 'gpt-5.4'] as const;
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

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
	const res = await fetch(url, init);
	if (!res.ok) {
		const errBody = await res.json().catch(() => ({ message: `API error ${res.status}` }));
		throw new Error(errBody.message || `API error ${res.status}`);
	}
	return res.json();
}

export default function Home() {
	const [text, setText] = useState(DEFAULT_TEXT);
	const [toLanguage, setToLanguage] = useState<(typeof LANGUAGES)[number]>('Spanish');
	const [model, setModel] = useState<(typeof MODELS)[number]>('gpt-5.4-nano');
	const [result, setResult] = useState<TranslateResult | null>(null);
	const [historyData, setHistoryData] = useState<HistoryData | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const history = (result ?? historyData)?.history ?? [];

	useEffect(() => {
		let ignore = false;

		async function loadHistory(): Promise<void> {
			try {
				const next = await fetchJson<HistoryData>('/api/translate');
				if (!ignore) {
					setHistoryData(next);
				}
			} catch {
				if (!ignore) {
					setHistoryData(null);
				}
			}
		}

		void loadHistory();

		return () => {
			ignore = true;
		};
	}, []);

	const handleTranslate = async () => {
		setIsLoading(true);
		setError(null);
		try {
			const next = await fetchJson<TranslateResult>('/api/translate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text, toLanguage, model }),
			});
			setResult(next);
			setHistoryData(next);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Translation failed');
		} finally {
			setIsLoading(false);
		}
	};

	const handleClearHistory = async () => {
		try {
			const next = await fetchJson<HistoryData>('/api/translate', { method: 'DELETE' });
			setResult(null);
			setHistoryData(next);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Could not clear history');
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
					<h1 className="text-5xl font-thin">
						Welcome to{' '}
						<a
							className="text-white transition-colors hover:text-cyan-400"
							href="https://agentuity.com"
							rel="noreferrer"
							target="_blank"
						>
							Agentuity
						</a>
					</h1>
					<p className="text-lg text-gray-400">
						The <span className="font-serif italic">Full-Stack</span> Platform for AI Agents
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
							<option value="gpt-5.4-nano">GPT-5.4 Nano</option>
							<option value="gpt-5.4-mini">GPT-5.4 Mini</option>
							<option value="gpt-5.4">GPT-5.4</option>
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
								<span>
									App session{' '}
									<strong className="text-gray-400">{result.sessionId.slice(0, 12)}...</strong>
								</span>
							</div>
						</div>
					)}
				</div>

				{/* Recent History */}
				<div className="flex flex-col gap-6 rounded-lg border border-gray-900 bg-black p-8">
					<div className="flex items-center justify-between">
						<h3 className="text-xl font-normal text-white">Recent translations</h3>
						{history.length > 0 && (
							<button
								className="rounded border border-gray-900 bg-transparent px-3 py-1.5 text-xs text-gray-500 transition-all duration-200 hover:border-gray-700 hover:bg-gray-900 hover:text-white"
								onClick={handleClearHistory}
								type="button"
							>
								Clear
							</button>
						)}
					</div>
					<div className="rounded-md bg-gray-950">
						{history.length > 0 ? (
							[...history].reverse().map((entry) => (
								<div
									className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-3 rounded px-3 py-2 text-xs"
									key={`${entry.timestamp}-${entry.sessionId}`}
								>
									<span className="truncate text-gray-400">{entry.text}</span>
									<span className="text-gray-700">→</span>
									<span className="truncate text-gray-400">{entry.translation}</span>
									<span className="rounded border border-gray-800 bg-gray-900 px-1 py-0.5 text-gray-400">
										{entry.toLanguage}
									</span>
								</div>
							))
						) : (
							<div className="px-3 py-2 text-sm text-gray-600">History will appear here</div>
						)}
					</div>
					{(result ?? historyData) && (
						<div className="flex gap-4 text-xs text-gray-500">
							<span>
								App session{' '}
								<strong className="text-gray-400">
									{(result ?? historyData)?.sessionId.slice(0, 12)}...
								</strong>
							</span>
							<span>
								Translations{' '}
								<strong className="text-gray-400">
									{(result ?? historyData)?.translationCount}
								</strong>
							</span>
						</div>
					)}
				</div>

				{/* How it works */}
				<div className="rounded-lg border border-gray-900 bg-black p-8">
					<h3 className="m-0 mb-6 text-xl font-normal leading-none text-white">How it works</h3>
					<div className="flex flex-col gap-6">
						{[
							{
								title: 'Key-value history',
								text: (
									<>
										<code className="text-white">KeyValueClient</code> stores recent
										translations for this browser session.
									</>
								),
							},
							{
								title: 'AI Gateway routing',
								text: (
									<>
										<code className="text-white">agentuity dev</code> automatically sets
										OPENAI_API_KEY and OPENAI_BASE_URL so the OpenAI SDK routes through
										Agentuity's AI Gateway.
									</>
								),
							},
							{
								title: 'Route actions',
								text: (
									<>
										Edit <code className="text-white">app/routes/api.translate.ts</code> to
										change the AI model, prompt, or add new routes.
									</>
								),
							},
							{
								title: 'React Router',
								text: (
									<>
										Add routes in <code className="text-white">app/routes/</code> — nested
										routing with built-in data loading.
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
			</div>
		</div>
	);
}
