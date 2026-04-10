import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { translateText } from '../server/translate';

export const Route = createFileRoute('/')({ component: App });

const LANGUAGES = ['Spanish', 'French', 'German', 'Japanese', 'Chinese'] as const;

function App() {
	const [text, setText] = useState('Hello, world! Welcome to Agentuity.');
	const [toLanguage, setToLanguage] = useState<string>('Spanish');
	const [result, setResult] = useState<{
		translation: string;
		tokens: number;
		model: string;
		toLanguage: string;
	} | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleTranslate = async () => {
		setIsLoading(true);
		setError(null);
		try {
			const res = await translateText({ text, toLanguage });
			setResult(res);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Translation failed');
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<main className="page-wrap px-4 pb-8 pt-14">
			<section className="island-shell rise-in relative overflow-hidden rounded-[2rem] px-6 py-10 sm:px-10 sm:py-14">
				<p className="island-kicker mb-3">Agentuity + TanStack Start</p>
				<h1 className="display-title mb-5 max-w-3xl text-4xl leading-[1.02] font-bold tracking-tight text-[var(--sea-ink)] sm:text-5xl">
					AI Translation Demo
				</h1>
				<p className="mb-8 max-w-2xl text-base text-[var(--sea-ink-soft)] sm:text-lg">
					Translate text using AI models through the Agentuity AI Gateway. Running via{' '}
					<code>agentuity dev</code> automatically routes AI SDK calls through the gateway — no
					separate API keys needed.
				</p>
			</section>

			<section className="island-shell mt-8 rounded-2xl p-6">
				<div className="space-y-4">
					<div>
						<label
							htmlFor="text-input"
							className="mb-1 block text-sm font-medium text-[var(--sea-ink)]"
						>
							Text to translate
						</label>
						<textarea
							id="text-input"
							value={text}
							onChange={(e) => setText(e.target.value)}
							rows={3}
							className="w-full rounded-lg border border-[rgba(23,58,64,0.2)] bg-white/50 px-3 py-2 text-sm"
						/>
					</div>

					<div className="flex items-end gap-3">
						<div>
							<label
								htmlFor="language-select"
								className="mb-1 block text-sm font-medium text-[var(--sea-ink)]"
							>
								Translate to
							</label>
							<select
								id="language-select"
								value={toLanguage}
								onChange={(e) => setToLanguage(e.target.value)}
								className="rounded-lg border border-[rgba(23,58,64,0.2)] bg-white/50 px-3 py-2 text-sm"
							>
								{LANGUAGES.map((lang) => (
									<option key={lang} value={lang}>
										{lang}
									</option>
								))}
							</select>
						</div>

						<button
							type="button"
							onClick={handleTranslate}
							disabled={isLoading || !text.trim()}
							className="rounded-full border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-5 py-2 text-sm font-semibold text-[var(--lagoon-deep)] transition hover:-translate-y-0.5 hover:bg-[rgba(79,184,178,0.24)] disabled:opacity-50"
						>
							{isLoading ? 'Translating...' : 'Translate'}
						</button>
					</div>

					{error && (
						<div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
					)}

					{result && (
						<div className="output space-y-2 rounded-lg bg-[rgba(79,184,178,0.08)] p-4">
							<p className="text-base text-[var(--sea-ink)]">{result.translation}</p>
							<p className="text-xs text-[var(--sea-ink-soft)]">
								Model: {result.model} · Tokens: {result.tokens} · Language:{' '}
								{result.toLanguage}
							</p>
						</div>
					)}
				</div>
			</section>
		</main>
	);
}
