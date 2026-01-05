import { type ChangeEvent, useCallback, useState } from 'react';
import { useAPI } from '@agentuity/react';
import './App.css'; // Styles for this component

const WORKBENCH_PATH = process.env.AGENTUITY_PUBLIC_WORKBENCH_PATH;

const DEFAULT_TEXT =
	'Welcome to Agentuity! This translation agent shows what you can build with the platform. It connects to AI models through our gateway, tracks usage with thread state, and runs quality checks automatically. Try translating this text into different languages to see the agent in action, and check the terminal for more details.';

const LANGUAGES = ['Spanish', 'French', 'German', 'Chinese'] as const;
const MODELS = ['gpt-5-nano', 'gpt-5-mini', 'gpt-5'] as const;

export function App() {
	const [text, setText] = useState(DEFAULT_TEXT);
	const [toLanguage, setToLanguage] = useState<(typeof LANGUAGES)[number]>('Spanish');
	const [model, setModel] = useState<(typeof MODELS)[number]>('gpt-5-nano');
	const [hoveredHistoryIndex, setHoveredHistoryIndex] = useState<number | null>(null);
	const [hoveredBadge, setHoveredBadge] = useState<'thread' | 'session' | null>(null);

	// RESTful API hooks for translation operations
	const { data: historyData, refetch: refetchHistory } = useAPI('GET /api/translate/history');
	const { data: translateResult, invoke: translate, isLoading } = useAPI('POST /api/translate');
	const { invoke: clearHistory } = useAPI('DELETE /api/translate/history');

	// Prefer fresh data from translation, fall back to initial fetch
	const history = translateResult?.history ?? historyData?.history ?? [];
	const threadId = translateResult?.threadId ?? historyData?.threadId;

	const handleTranslate = useCallback(async () => {
		await translate({ text, toLanguage, model });
	}, [text, toLanguage, model, translate]);

	const handleClearHistory = useCallback(async () => {
		await clearHistory();
		await refetchHistory();
	}, [clearHistory, refetchHistory]);

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
					) : translateResult?.translation ? (
						<div className="result">
							<div className="translation-output">{translateResult.translation}</div>
							<div className="result-meta">
								{translateResult.tokens > 0 && (
									<>
										<span>
											Tokens: <strong>{translateResult.tokens}</strong>
										</span>
										<span className="separator">|</span>
									</>
								)}
								{translateResult.threadId && (
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
													<code className="badge-tooltip-id-value">{translateResult.threadId}</code>
												</div>
											</div>
										)}
										Thread: <strong>{translateResult.threadId.slice(0, 12)}...</strong>
									</span>
								)}
								{translateResult.sessionId && (
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
														<code className="badge-tooltip-id-value">{translateResult.sessionId}</code>
													</div>
												</div>
											)}
											Session: <strong>{translateResult.sessionId.slice(0, 12)}...</strong>
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
						{history.length > 0 && (
							<button className="clear-btn" onClick={handleClearHistory} type="button">
								Clear
							</button>
						)}
					</div>
					<div className="history-container">
						{history.length > 0 ? (
							<div className="history-list">
								{[...history].reverse().map((entry, index) => (
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
												</div>
												<div className="tooltip-divider" />
												<div className="tooltip-section">
													<div className="tooltip-row">
														<span className="tooltip-label">Thread</span>
														<span className="tooltip-value tooltip-id">{threadId?.slice(0, 12)}...</span>
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
										Uses <code>@agentuity/schema</code> for type-safe validation with{' '}
										<code>s.string()</code> and <code>s.object()</code>.
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
		</div>
	);
}
