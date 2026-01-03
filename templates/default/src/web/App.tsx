import { type ChangeEvent, useCallback, useEffect, useState } from 'react';
import { useAPI } from '@agentuity/react';

const WORKBENCH_PATH = process.env.AGENTUITY_PUBLIC_WORKBENCH_PATH;

const DEFAULT_TEXT =
	'Welcome to Agentuity! This translation agent shows what you can build with the platform. It connects to AI models through our gateway, tracks usage with thread state, and runs quality checks automatically. Try translating this text into different languages to see the agent in action, and check the terminal for more details.';

const LANGUAGES = ['Spanish', 'French', 'German', 'Chinese'] as const;
const MODELS = ['gpt-5-nano', 'gpt-5-mini', 'gpt-5'] as const;

// Format latency: show seconds if >= 1000ms
const formatLatency = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);

export function App() {
	const [text, setText] = useState(DEFAULT_TEXT);
	const [toLanguage, setToLanguage] = useState<(typeof LANGUAGES)[number]>('Spanish');
	const [model, setModel] = useState<(typeof MODELS)[number]>('gpt-5-nano');
	const [hoveredHistoryIndex, setHoveredHistoryIndex] = useState<number | null>(null);
	const [hoveredBadge, setHoveredBadge] = useState<'thread' | 'session' | null>(null);

	// useAPI hook handles loading state and response typing automatically
	const { data: result, invoke, isLoading } = useAPI('POST /api/translate');

	const handleTranslate = useCallback(async () => {
		await invoke({ text, toLanguage, model });
	}, [text, toLanguage, model, invoke]);

	const handleClearHistory = useCallback(async () => {
		await invoke({ command: 'clear' });
	}, [invoke]);

	// Load existing translation history on mount
	useEffect(() => {
		invoke({});
	}, [invoke]);

	return (
		<div className="app-container">
			<div className="content-wrapper">
				<div className="header">
					<svg
						aria-hidden="true"
						aria-label="Agentuity Logo"
						className="logo"
						fill="none"
						height="191"
						viewBox="0 0 220 191"
						width="220"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							clipRule="evenodd"
							d="M220 191H0L31.427 136.5H0L8 122.5H180.5L220 191ZM47.5879 136.5L24.2339 177H195.766L172.412 136.5H47.5879Z"
							fill="#00FFFF"
							fillRule="evenodd"
						/>
						<path
							clipRule="evenodd"
							d="M110 0L157.448 82.5H189L197 96.5H54.5L110 0ZM78.7021 82.5L110 28.0811L141.298 82.5H78.7021Z"
							fill="#00FFFF"
							fillRule="evenodd"
						/>
					</svg>

					<h1 className="title">Translation Agent</h1>

					<p className="subtitle">
						Powered by <span className="italic">Agentuity</span>
					</p>
				</div>

				<div className="card card-interactive">
					<div className="controls-row">
						<span className="control-label">
							Translate to{' '}
							<select
								className="inline-select"
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
						</span>

						<span className="control-label">
							using{' '}
							<select
								className="inline-select"
								disabled={isLoading}
								onChange={(e: ChangeEvent<HTMLSelectElement>) =>
									setModel(e.currentTarget.value as (typeof MODELS)[number])
								}
								value={model}
							>
								<option value="gpt-5-nano">GPT-5 Nano</option>
								<option value="gpt-5-mini">GPT-5 Mini</option>
								<option value="gpt-5">GPT-5</option>
							</select>
						</span>

						<div className="glow-btn">
							<div className="glow-bg" />
							<div className="glow-effect" />
							<button
								className={`button ${isLoading ? 'disabled' : ''}`}
								disabled={isLoading}
								onClick={handleTranslate}
								type="button"
							>
								{isLoading ? 'Translating...' : 'Translate'}
							</button>
						</div>
					</div>

					<textarea
						className="textarea"
						disabled={isLoading}
						onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setText(e.currentTarget.value)}
						placeholder="Enter text to translate..."
						rows={4}
						value={text}
					/>

					{isLoading ? (
						<div className="output">
							<span className="loading-text">
								Translating to {toLanguage}
								<span className="loading-dots">
									<span>.</span>
									<span>.</span>
									<span>.</span>
								</span>
							</span>
						</div>
					) : result?.translation ? (
						<div className="result">
							<div className="translation-output">{result.translation}</div>
							<div className="result-meta">
								{result.tokens > 0 && (
									<>
										<span>
											Tokens: <strong>{result.tokens}</strong>
										</span>
										<span className="separator">|</span>
									</>
								)}
								{result.threadId && (
									<span
										className="id-badge"
										onMouseEnter={() => setHoveredBadge('thread')}
										onMouseLeave={() => setHoveredBadge(null)}
									>
										{hoveredBadge === 'thread' && (
											<div className="id-badge-tooltip">
												<div className="badge-tooltip-title">Thread ID</div>
												<p className="badge-tooltip-desc">
													Your <strong>conversation context</strong> that persists across requests.
													All translations share this thread, letting the agent remember history.
												</p>
												<p className="badge-tooltip-desc">
													Each request gets a unique session ID, but the <em>thread stays the same</em>.
												</p>
												<div className="badge-tooltip-id">
													<span className="badge-tooltip-id-label">ID</span>
													<code className="badge-tooltip-id-value">{result.threadId}</code>
												</div>
											</div>
										)}
										Thread: <strong>{result.threadId.slice(0, 12)}...</strong>
									</span>
								)}
								{result.sessionId && (
									<>
										<span className="separator">|</span>
										<span
											className="id-badge"
											onMouseEnter={() => setHoveredBadge('session')}
											onMouseLeave={() => setHoveredBadge(null)}
										>
											{hoveredBadge === 'session' && (
												<div className="id-badge-tooltip">
													<div className="badge-tooltip-title">Session ID</div>
													<p className="badge-tooltip-desc">
														A <strong>unique identifier</strong> for this specific request.
														Useful for debugging and tracing individual operations in your agent logs.
													</p>
													<p className="badge-tooltip-desc">
														Unlike threads, sessions are <em>unique per request</em>.
													</p>
													<div className="badge-tooltip-id">
														<span className="badge-tooltip-id-label">ID</span>
														<code className="badge-tooltip-id-value">{result.sessionId}</code>
													</div>
												</div>
											)}
											Session: <strong>{result.sessionId.slice(0, 12)}...</strong>
										</span>
									</>
								)}
							</div>
						</div>
					) : (
						<div className="output">Translation will appear here</div>
					)}
				</div>

				<div className="card">
					<div className="section-header">
						<h3 className="section-title">Recent Translations</h3>
						{result?.history && result.history.length > 0 && (
							<button className="clear-btn" onClick={handleClearHistory} type="button">
								Clear
							</button>
						)}
					</div>
					<div className="history-container">
						{result?.history && result.history.length > 0 ? (
							<div className="history-list">
								{[...result.history].reverse().map((entry, index) => (
									<div
										key={`${entry.timestamp}-${index}`}
										className="history-item"
										onMouseEnter={() => setHoveredHistoryIndex(index)}
										onMouseLeave={() => setHoveredHistoryIndex(null)}
									>
										{hoveredHistoryIndex === index && (
											<div className="history-tooltip">
												<div className="tooltip-section">
													<div className="tooltip-row">
														<span className="tooltip-label">Model</span>
														<span className="tooltip-value">{entry.model}</span>
													</div>
													<div className="tooltip-row">
														<span className="tooltip-label">Tokens</span>
														<span className="tooltip-value">{entry.tokens}</span>
													</div>
													<div className="tooltip-row">
														<span className="tooltip-label">Latency</span>
														<span className="tooltip-value">{formatLatency(entry.latencyMs)}</span>
													</div>
												</div>
												<div className="tooltip-divider" />
												<div className="tooltip-section">
													<div className="tooltip-row">
														<span className="tooltip-label">Thread</span>
														<span className="tooltip-value tooltip-id">{result.threadId.slice(0, 12)}...</span>
														<span className="tooltip-hint">(same for all)</span>
													</div>
													<div className="tooltip-row">
														<span className="tooltip-label">Session</span>
														<span className="tooltip-value tooltip-id">{entry.sessionId.slice(0, 12)}...</span>
														<span className="tooltip-hint">(unique)</span>
													</div>
												</div>
											</div>
										)}
										<span className="history-text">{entry.text}</span>
										<span className="history-arrow">→</span>
										<span className="history-lang">{entry.toLanguage}</span>
										<span className="history-translation">{entry.translation}</span>
										<span className="history-session">
											{entry.sessionId.slice(0, 8)}...
										</span>
									</div>
								))}
							</div>
						) : (
							<div className="history-empty-text">History will appear here</div>
						)}
					</div>
				</div>

				<div className="card">
					<h3 className="section-title section-title-standalone">Features Demonstrated</h3>

					<div className="steps-list">
						{[
							{
								key: 'schemas',
								title: 'Typed Schemas',
								text: (
									<>
										Input uses <code>s.string()</code> and <code>s.enum()</code> for type-safe
										validation.
									</>
								),
							},
							{
								key: 'useapi',
								title: 'useAPI Hook',
								text: (
									<>
										Frontend uses <code>useAPI()</code> for typed API calls with automatic loading
										state.
									</>
								),
							},
							{
								key: 'threads',
								title: 'Thread & Session State',
								text: (
									<>
										Translation history persists in thread state. Thread ID stays the same across
										requests; session ID changes each time.
									</>
								),
							},
							WORKBENCH_PATH
								? {
										key: 'workbench',
										title: (
											<>
												Try{' '}
												<a href={WORKBENCH_PATH} className="workbench-link">
													Workbench
												</a>
											</>
										),
										text: <>Test the translate agent directly in the dev UI.</>,
									}
								: null,
						]
							.filter(Boolean)
							.map((step) => (
								<div key={step!.key} className="step">
									<div className="step-icon">
										<svg
											aria-hidden="true"
											className="checkmark"
											fill="none"
											height="24"
											stroke="#00c951"
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth="2"
											viewBox="0 0 24 24"
											width="24"
											xmlns="http://www.w3.org/2000/svg"
										>
											<path d="M20 6 9 17l-5-5"></path>
										</svg>
									</div>

									<div>
										<h4 className="step-title">{step!.title}</h4>
										<p className="step-text">{step!.text}</p>
									</div>
								</div>
							))}
					</div>
				</div>
			</div>

			<style>
				{`
					body {
						background-color: #09090b;
					}

					.app-container {
						background-color: #09090b;
						color: #fff;
						display: flex;
						font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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

					.header {
						align-items: center;
						display: flex;
						flex-direction: column;
						gap: 0.5rem;
						justify-content: center;
						margin-bottom: 2rem;
						position: relative;
						text-align: center;
					}

					.workbench-link {
						background: linear-gradient(90deg, #155e75, #3b82f6, #9333ea, #155e75);
						background-size: 300% 100%;
						background-clip: text;
						-webkit-background-clip: text;
						-webkit-text-fill-color: transparent;
						color: transparent;
						text-decoration: none;
						animation: gradientShift 2s ease-in-out infinite alternate;
						position: relative;
					}

					.workbench-link::after {
						content: '';
						position: absolute;
						bottom: 0;
						left: 0;
						width: 100%;
						height: 1px;
						background: linear-gradient(90deg, #155e75, #3b82f6, #9333ea, #155e75);
						background-size: 300% 100%;
						animation: gradientShift 2s ease-in-out infinite alternate;
						opacity: 0;
						transition: opacity 0.3s ease;
					}

					.workbench-link:hover::after {
						opacity: 1;
					}

					@keyframes gradientShift {
						0% {
							background-position: 0% 50%;
						}
						100% {
							background-position: 100% 50%;
						}
					}

					.logo {
						height: auto;
						margin-bottom: 1rem;
						width: 3rem;
					}

					.title {
						font-size: 3rem;
						font-weight: 100;
						margin: 0;
					}

					.subtitle {
						color: #a1a1aa;
						font-size: 1.15rem;
						margin: 0;
					}

					.italic {
						font-family: Georgia, "Times New Roman", Times, serif;
						font-style: italic;
						font-weight: 100;
					}

					.card {
						background: #000;
						border: 1px solid #18181b;
						border-radius: 0.5rem;
						padding: 2rem;
					}

					.card-interactive {
						box-shadow: 0 1.5rem 3rem -0.75rem #00000040;
						display: flex;
						flex-direction: column;
						gap: 1.5rem;
						overflow: hidden;
					}

					.card-title {
						color: #a1a1aa;
						font-size: 1.25rem;
						font-weight: 400;
						line-height: 1.5;
						margin: 0;
					}

					.inline-select {
						appearance: none;
						background: transparent;
						border: none;
						border-bottom: 1px dashed #3f3f46;
						color: #fff;
						cursor: pointer;
						font-size: inherit;
						font-weight: 400;
						outline: none;
						padding: 0 1.25rem 0.125rem 0;
						background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
						background-repeat: no-repeat;
						background-position: right 0 center;
					}

					.inline-select:hover {
						border-bottom-color: #22d3ee;
					}

					.inline-select:focus {
						border-bottom-color: #22d3ee;
						border-bottom-style: solid;
					}

					.inline-select option {
						background: #09090b;
						color: #fff;
					}

					.highlight {
						color: #fff;
					}

					.controls-row {
						align-items: center;
						display: flex;
						flex-wrap: wrap;
						gap: 1.5rem;
					}

					.control-label {
						color: #a1a1aa;
						font-size: 1rem;
					}

					.textarea {
						background: #09090b;
						border: 1px solid #2b2b30;
						border-radius: 0.375rem;
						color: #fff;
						font-family: inherit;
						font-size: 0.95rem;
						line-height: 1.6;
						outline: none;
						padding: 0.75rem 1rem;
						resize: vertical;
						min-height: 100px;
					}

					.textarea:focus {
						border-color: #3b82f6;
					}

					.glow-btn {
						position: relative;
						z-index: 1;
						align-self: flex-start;
					}

					.glow-bg {
						background: linear-gradient(to right, #155e75, #3b82f6, #9333ea);
						border-radius: 0.5rem;
						inset: 0;
						position: absolute;
						filter: blur(1.25rem);
						opacity: 0.75;
						transition: all 700ms;
					}

					.glow-btn:hover .glow-bg {
						filter: blur(2rem);
						opacity: 1;
					}

					.glow-effect {
						background: #0891b280;
						border-radius: 0.5rem;
						filter: blur(2.5rem);
						inset: 0;
						opacity: 0.5;
						position: absolute;
					}

					.button {
						background-color: #030712;
						border: none;
						border-radius: 0.5rem;
						color: #fff;
						cursor: pointer;
						padding: 0.75rem 1.5rem;
						position: relative;
						transition: opacity 0.2s;
						white-space: nowrap;
					}

					.button.disabled {
						cursor: not-allowed;
						opacity: 0.5;
					}

					.result {
						display: flex;
						flex-direction: column;
						gap: 0.75rem;
					}

					.translation-output {
						background: #09090b;
						border: 1px solid #2b2b30;
						border-radius: 0.375rem;
						color: #22d3ee;
						font-size: 0.95rem;
						line-height: 1.6;
						padding: 0.75rem 1rem;
					}

					.result-meta {
						color: #71717a;
						display: flex;
						flex-wrap: wrap;
						font-size: 0.75rem;
						gap: 0.5rem;
					}

					.result-meta strong {
						color: #a1a1aa;
					}

					.id-badge {
						border-bottom: 1px dashed #3f3f46;
						cursor: help;
						padding-bottom: 1px;
						position: relative;
						transition: border-color 0.2s;
					}

					.id-badge:hover {
						border-bottom-color: #22d3ee;
					}

					.id-badge-tooltip {
						position: absolute;
						bottom: 100%;
						left: 50%;
						transform: translateX(-50%);
						background: #18181b;
						border: 1px solid #27272a;
						border-radius: 0.5rem;
						padding: 1rem;
						font-size: 0.8rem;
						line-height: 1.5;
						width: 320px;
						z-index: 10;
						margin-bottom: 0.5rem;
						box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
						text-align: left;
					}

					.id-badge-tooltip::after {
						content: '';
						position: absolute;
						top: 100%;
						left: 50%;
						transform: translateX(-50%);
						border: 6px solid transparent;
						border-top-color: #27272a;
					}

					.badge-tooltip-title {
						color: #fff;
						font-weight: 600;
						font-size: 0.9rem;
						margin-bottom: 0.5rem;
					}

					.badge-tooltip-desc {
						color: #a1a1aa;
						margin: 0 0 0.5rem 0;
						font-size: 0.8rem;
					}

					.badge-tooltip-desc:last-of-type {
						margin-bottom: 0.75rem;
					}

					.badge-tooltip-desc strong {
						color: #e4e4e7;
						font-weight: 500;
					}

					.badge-tooltip-desc em {
						color: #e4e4e7;
						font-style: normal;
						font-weight: 600;
					}

					.badge-tooltip-id {
						display: flex;
						flex-direction: column;
						gap: 0.375rem;
						padding-top: 0.75rem;
						border-top: 1px solid #27272a;
					}

					.badge-tooltip-id-label {
						color: #71717a;
						font-size: 0.65rem;
						text-transform: uppercase;
						letter-spacing: 0.05em;
					}

					.badge-tooltip-id-value {
						color: #22d3ee;
						font-family: ui-monospace, monospace;
						font-size: 0.7rem;
						word-break: break-all;
						line-height: 1.4;
						background: #27272a;
						padding: 0.375rem 0.5rem;
						border-radius: 0.25rem;
					}

					.separator {
						color: #3f3f46;
					}

					.output {
						background: #09090b;
						border: 1px solid #2b2b30;
						border-radius: 0.375rem;
						color: #52525b;
						font-size: 0.9rem;
						line-height: 1.6;
						min-height: 3rem;
						padding: 0.75rem 1rem;
					}

					.loading-text {
						color: #22d3ee;
					}

					.loading-dots span {
						animation: blink 1.4s infinite;
						opacity: 0;
					}

					.loading-dots span:nth-child(1) { animation-delay: 0s; }
					.loading-dots span:nth-child(2) { animation-delay: 0.2s; }
					.loading-dots span:nth-child(3) { animation-delay: 0.4s; }

					@keyframes blink {
						0%, 20% { opacity: 0; }
						40%, 100% { opacity: 1; }
					}

					.section-header {
						align-items: center;
						display: flex;
						justify-content: space-between;
						margin-bottom: 1.5rem;
					}

					.section-title {
						color: #fff;
						font-size: 1.25rem;
						font-weight: 400;
						line-height: 1;
						margin: 0;
					}

					.section-title-standalone {
						margin-bottom: 1.5rem;
					}

					.clear-btn {
						background: transparent;
						border: 1px solid #27272a;
						border-radius: 0.25rem;
						color: #a1a1aa;
						cursor: pointer;
						font-size: 0.75rem;
						padding: 0.375rem 0.75rem;
						transition: all 0.2s;
					}

					.clear-btn:hover {
						background: #18181b;
						border-color: #3f3f46;
						color: #fff;
					}

					.history-container {
						background: #09090b;
						border: 1px solid #2b2b30;
						border-radius: 0.375rem;
						padding: 0.75rem 1rem;
					}

					.history-list {
						display: flex;
						flex-direction: column;
						gap: 0.75rem;
					}

					.history-item {
						align-items: center;
						display: grid;
						font-size: 0.8rem;
						gap: 0.75rem;
						grid-template-columns: 1fr auto auto 1fr auto;
						padding: 0.5rem;
						margin: -0.5rem;
						border-radius: 0.25rem;
						cursor: help;
						position: relative;
						transition: background 0.15s;
					}

					.history-item:hover {
						background: #18181b;
					}

					.history-tooltip {
						position: absolute;
						bottom: 100%;
						left: 50%;
						transform: translateX(-50%);
						background: #18181b;
						border: 1px solid #27272a;
						border-radius: 0.5rem;
						padding: 0.75rem;
						font-size: 0.75rem;
						z-index: 10;
						margin-bottom: 0.5rem;
						box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
						min-width: 200px;
					}

					.tooltip-section {
						display: flex;
						flex-direction: column;
						gap: 0.375rem;
					}

					.tooltip-row {
						display: flex;
						align-items: center;
						gap: 0.5rem;
					}

					.tooltip-label {
						color: #71717a;
						min-width: 3.5rem;
					}

					.tooltip-value {
						color: #e4e4e7;
						font-weight: 500;
					}

					.tooltip-id {
						font-family: ui-monospace, monospace;
						color: #22d3ee;
						font-weight: 400;
						background: #27272a;
						padding: 0.125rem 0.375rem;
						border-radius: 0.25rem;
					}

					.tooltip-hint {
						color: #52525b;
						font-size: 0.65rem;
						font-style: italic;
					}

					.tooltip-divider {
						height: 1px;
						background: #27272a;
						margin: 0.5rem 0;
					}

					.history-text {
						color: #71717a;
						overflow: hidden;
						text-overflow: ellipsis;
						white-space: nowrap;
					}

					.history-arrow {
						color: #3f3f46;
					}

					.history-lang {
						background: #18181b;
						border: 1px solid #27272a;
						border-radius: 0.25rem;
						color: #a1a1aa;
						font-size: 0.7rem;
						padding: 0.25rem 0.625rem;
						text-align: center;
						min-width: 4.5rem;
					}

					.history-translation {
						color: #a1a1aa;
						overflow: hidden;
						text-overflow: ellipsis;
						white-space: nowrap;
					}

					.history-session {
						color: #52525b;
						font-family: ui-monospace, monospace;
						font-size: 0.65rem;
					}

					.history-empty-text {
						color: #52525b;
						font-size: 0.85rem;
					}

					.steps-list {
						display: flex;
						flex-direction: column;
						gap: 1.5rem;
					}

					.step {
						align-items: flex-start;
						display: flex;
						gap: 0.75rem;
					}

					.step-icon {
						align-items: center;
						background-color: #002810;
						border: 1px solid #00c951;
						border-radius: 0.25rem;
						display: flex;
						height: 1rem;
						justify-content: center;
						width: 1rem;
					}

					.checkmark {
						height: 0.65rem;
						width: 0.65rem;
					}

					.step-title {
						color: #fff;
						font-size: 0.875rem;
						font-weight: 400;
						margin: 0 0 0.25rem 0;
					}

					.step-text {
						color: #a1a1aa;
						font-size: 0.75rem;
						margin: 0;
					}

					.step-text code {
						color: #fff;
					}

					@keyframes ellipsis {
						0% { content: ""; }
						25% { content: "."; }
						50% { content: ".."; }
						75% { content: "..."; }
						100% { content: ""; }
					}

					[data-loading="true"]::after {
						animation: ellipsis 1.2s steps(1, end) infinite;
						content: ".";
						display: inline-block;
						width: 1em;
					}
				`}
			</style>
		</div>
	);
}
