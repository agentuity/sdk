'use client';

import { type ChangeEvent, useState } from 'react';

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

export default function Home() {
	const [text, setText] = useState(DEFAULT_TEXT);
	const [toLanguage, setToLanguage] = useState<Language>('Spanish');
	const [model, setModel] = useState<Model>('gpt-4o-mini');
	const [result, setResult] = useState<Result | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

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
			setResult((await res.json()) as Result);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Translation failed');
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<main className="page">
			<header className="header">
				<svg
					aria-hidden="true"
					className="logo"
					fill="none"
					viewBox="0 0 220 191"
					xmlns="http://www.w3.org/2000/svg"
				>
					<path
						clipRule="evenodd"
						d="M220 191H0L31.427 136.5H0L8 122.5H180.5L220 191ZM47.5879 136.5L24.2339 177H195.766L172.412 136.5H47.5879Z"
						fill="currentColor"
						fillRule="evenodd"
					/>
					<path
						clipRule="evenodd"
						d="M110 0L157.448 82.5H189L197 96.5H54.5L110 0ZM78.7021 82.5L110 28.0811L141.298 82.5H78.7021Z"
						fill="currentColor"
						fillRule="evenodd"
					/>
				</svg>
				<h1>Welcome to Agentuity</h1>
				<p className="subtitle">
					<em>Next.js</em> + AI Gateway
				</p>
			</header>

			<section className="card">
				<div className="controls">
					<span>Translate to</span>
					<select
						disabled={isLoading}
						onChange={(e: ChangeEvent<HTMLSelectElement>) =>
							setToLanguage(e.currentTarget.value as Language)
						}
						value={toLanguage}
					>
						{LANGUAGES.map((lang) => (
							<option key={lang} value={lang}>
								{lang}
							</option>
						))}
					</select>
					<span>using</span>
					<select
						disabled={isLoading}
						onChange={(e: ChangeEvent<HTMLSelectElement>) =>
							setModel(e.currentTarget.value as Model)
						}
						value={model}
					>
						{MODELS.map((m) => (
							<option key={m} value={m}>
								{m}
							</option>
						))}
					</select>
					<button
						className="translate-btn"
						data-loading={isLoading}
						disabled={isLoading || !text.trim()}
						onClick={handleTranslate}
						type="button"
					>
						{isLoading ? 'Translating' : 'Translate'}
					</button>
				</div>

				<textarea
					disabled={isLoading}
					onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setText(e.currentTarget.value)}
					placeholder="Enter text to translate..."
					rows={4}
					value={text}
				/>

				{error ? (
					<div className="error">{error}</div>
				) : isLoading ? (
					<div className="placeholder" data-loading="true" />
				) : !result?.translation ? (
					<div className="output placeholder">Translation will appear here</div>
				) : (
					<>
						<div className="output result">{result.translation}</div>
						<div className="meta">
							{result.tokens > 0 && (
								<span>
									Tokens <strong>{result.tokens}</strong>
								</span>
							)}
							<span>
								Model <strong>{result.model}</strong>
							</span>
							<span>
								Language <strong>{result.toLanguage}</strong>
							</span>
						</div>
					</>
				)}
			</section>

			<section className="card info">
				<h3>How it works</h3>
				<ul>
					<li>
						<strong>AI Gateway routing</strong> — <code>agentuity dev</code> injects{' '}
						<code>OPENAI_API_KEY</code> and <code>OPENAI_BASE_URL</code> so the AI SDK routes
						through the Agentuity gateway.
					</li>
					<li>
						<strong>Route handlers</strong> — edit <code>app/api/translate/route.ts</code> to
						change the model or prompt.
					</li>
					<li>
						<strong>Next.js App Router</strong> — add pages under <code>app/</code> using
						file-based routing with server components by default.
					</li>
				</ul>
			</section>
		</main>
	);
}
