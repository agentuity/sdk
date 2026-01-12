import { useAnalytics, useAPI } from '@agentuity/react';
import { type ChangeEvent, Fragment, useCallback, useState } from 'react';
import './App.css';

const WORKBENCH_PATH = process.env.AGENTUITY_PUBLIC_WORKBENCH_PATH;
const LANGUAGES = ['Spanish', 'French', 'German', 'Chinese'] as const;
const MODELS = ['gpt-5-nano', 'gpt-5-mini', 'gpt-5'] as const;
const DEFAULT_TEXT =
	'Welcome to Agentuity! This translation agent shows what you can build with the platform. It connects to AI models through our gateway, tracks usage with thread state, and runs quality checks automatically. Try translating this text into different languages to see the agent in action, and check the terminal for more details.';

export function App() {
	const [text, setText] = useState(DEFAULT_TEXT);
	const [toLanguage, setToLanguage] = useState<(typeof LANGUAGES)[number]>('Spanish');
	const [model, setModel] = useState<(typeof MODELS)[number]>('gpt-5-nano');

	// RESTful API hooks for translation operations
	const { data: historyData, refetch: refetchHistory } = useAPI('GET /api/translate/history');

	const { data: translateResult, invoke: translate, isLoading } = useAPI('POST /api/translate');

	const { invoke: clearHistory } = useAPI('DELETE /api/translate/history');

	const { track } = useAnalytics();

	// Prefer fresh data from translation, fall back to initial fetch
	const history = translateResult?.history ?? historyData?.history ?? [];
	const threadId = translateResult?.threadId ?? historyData?.threadId;

	const handleTranslate = useCallback(async () => {
		track('translate', {
			text,
			toLanguage,
			model,
		});
		await translate({ text, toLanguage, model });
	}, [text, toLanguage, model, translate, track]);

	const handleClearHistory = useCallback(async () => {
		track('clear_history');
		await clearHistory();
		await refetchHistory();
	}, [clearHistory, refetchHistory, track]);

	return (
		<div className="text-white flex font-sans justify-center min-h-screen">
			<div className="flex flex-col gap-4 max-w-3xl p-16 w-full">
				{/* Header */}
				<div className="items-center flex flex-col gap-2 justify-center mb-8 relative text-center">
					<svg
						aria-hidden="true"
						className="h-auto mb-4 w-12"
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

					<p className="text-gray-400 text-lg">
						The <span className="italic font-serif">Full-Stack</span> Platform for AI Agents
					</p>
				</div>

				{/* Translate Form */}
				<div className="bg-black border border-gray-900 text-gray-400 rounded-lg p-8 shadow-2xl flex flex-col gap-6 ">
					<div className="items-center flex flex-wrap gap-1.5">
						Translate to
						<select
							className="appearance-none bg-transparent border-0 border-b border-dashed border-gray-700 text-white cursor-pointer font-normal outline-none hover:border-b-cyan-400 focus:border-b-cyan-400 -mb-0.5"
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
							className="appearance-none bg-transparent border-0 border-b border-dashed border-gray-700 text-white cursor-pointer font-normal outline-none hover:border-b-cyan-400 focus:border-b-cyan-400 -mb-0.5"
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
						<div className="relative group ml-auto z-0">
							<div className="absolute inset-0 bg-linear-to-r from-cyan-700 via-blue-500 to-purple-600 rounded-lg blur-xl opacity-75 group-hover:blur-2xl group-hover:opacity-100 transition-all duration-700" />

							<div className="absolute inset-0 bg-cyan-500/50 rounded-lg blur-3xl opacity-50" />

							<button
								className="relative font-semibold text-white px-4 py-2 bg-gray-950 rounded-lg shadow-2xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
								disabled={isLoading}
								onClick={handleTranslate}
								type="button"
								data-loading={isLoading}
							>
								{isLoading ? 'Translating' : 'Translate'}
							</button>
						</div>
					</div>

					<textarea
						className="text-sm bg-gray-950 border border-gray-800 rounded-md text-white resize-y py-3 px-4 min-h-28 focus:outline-cyan-500 focus:outline-2 focus:outline-offset-2 z-10"
						disabled={isLoading}
						onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setText(e.currentTarget.value)}
						placeholder="Enter text to translate..."
						rows={4}
						value={text}
					/>

					{/* Translation Result */}
					{isLoading ? (
						<div
							className="text-sm bg-gray-950 border border-gray-800 rounded-md text-gray-600 py-3 px-4"
							data-loading
						/>
					) : !translateResult?.translation ? (
						<div className="text-sm bg-gray-950 border border-gray-800 rounded-md text-gray-600 py-3 px-4">
							Translation will appear here
						</div>
					) : (
						<div className="flex flex-col gap-3">
							<div className="text-sm bg-gray-950 border border-gray-800 rounded-md text-cyan-500 py-3 px-4">
								{translateResult.translation}
							</div>

							<div className="text-gray-500 flex text-xs gap-4">
								{translateResult.tokens > 0 && (
									<span>
										Tokens{' '}
										<strong className="text-gray-400">{translateResult.tokens}</strong>
									</span>
								)}

								{translateResult.threadId && (
									<span className="group border-b border-dashed border-gray-700 cursor-help relative transition-colors duration-200 hover:border-b-cyan-400">
										<span>
											Thread{' '}
											<strong className="text-gray-400">
												{translateResult.threadId.slice(0, 12)}...
											</strong>
										</span>

										{/* Pop-up */}
										<div className="group-hover:flex hidden absolute left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-800 rounded-lg p-4 leading-normal z-10 mb-2 shadow-2xl text-left w-72 bottom-full flex-col gap-2">
											<div className="text-base text-white font-semibold">Thread ID</div>

											<p className="text-gray-400">
												Your{' '}
												<strong className="text-gray-200">conversation context</strong>{' '}
												that persists across requests. All translations share this
												thread, letting the agent remember history.
											</p>

											<p className="text-gray-400">
												Each request gets a unique session ID, but the{' '}
												<strong className="text-gray-200">thread stays the same</strong>
												.
											</p>
										</div>
									</span>
								)}

								{translateResult.sessionId && (
									<span className="group border-b border-dashed border-gray-700 cursor-help relative transition-colors duration-200 hover:border-b-cyan-400">
										<span>
											Session{' '}
											<strong className="text-gray-400">
												{translateResult.sessionId.slice(0, 12)}...
											</strong>
										</span>

										{/* Pop-up */}
										<div className="group-hover:flex hidden absolute left-1/2 -translate-x-1/2 -translate-y-2 bg-gray-900 border border-gray-800 rounded-lg p-4 leading-normal z-10 shadow-2xl text-left w-72 bottom-full flex-col gap-2">
											<div className="text-base text-white font-semibold">
												Session ID
											</div>

											<p className="text-gray-400">
												A <strong className="text-gray-200">unique identifier</strong>{' '}
												for this specific request. Useful for debugging and tracing
												individual operations in your agent logs.
											</p>

											<p className="text-gray-400">
												Unlike threads, sessions are{' '}
												<strong className="text-gray-200">unique per request</strong>.
											</p>
										</div>
									</span>
								)}
							</div>
						</div>
					)}
				</div>

				<div className="bg-black border border-gray-900 rounded-lg p-8 flex flex-col gap-6">
					<div className="items-center flex justify-between">
						<h3 className="text-white text-xl font-normal">Recent Translations</h3>

						{history.length > 0 && (
							<button
								className="bg-transparent border border-gray-900 rounded text-gray-500 cursor-pointer text-xs transition-all duration-200 py-1.5 px-3 hover:bg-gray-900 hover:border-gray-700 hover:text-white"
								onClick={handleClearHistory}
								type="button"
							>
								Clear
							</button>
						)}
					</div>

					<div className="bg-gray-950 rounded-md">
						{history.length > 0 ? (
							[...history].reverse().map((entry, index) => (
								<button
									key={`${entry.timestamp}-${index}`}
									type="button"
									tabIndex={0}
									className="group items-center grid w-full text-xs gap-3 py-2 px-3 rounded cursor-help relative transition-colors duration-150 hover:bg-gray-900 focus:outline-none grid-cols-[minmax(0,min-content)_auto_1fr_auto] text-left"
									aria-label={`Translation from ${entry.text} to ${entry.toLanguage}: ${entry.translation}`}
								>
									<span className="text-gray-400 truncate">{entry.text}</span>

									<span className="text-gray-700 flex items-center gap-1">
										→
										<span className="bg-gray-900 border border-gray-800 rounded text-gray-400 text-center py-0.5 px-1">
											{entry.toLanguage}
										</span>
									</span>

									<span className="text-gray-400 truncate">{entry.translation}</span>

									<span className="text-gray-600">{entry.sessionId.slice(0, 12)}...</span>

									{/* Pop-up */}
									<div className="group-hover:grid hidden absolute left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-800 rounded-lg p-4 leading-normal z-10 mb-2 shadow-2xl text-left bottom-full gap-2 grid-cols-[auto_1fr_auto]">
										{[
											{
												label: 'Model',
												value: entry.model,
												description: null,
											},
											{
												label: 'Tokens',
												value: entry.tokens,
												description: null,
											},
											{
												label: 'Thread',
												value: `${threadId?.slice(0, 12)}...`,
												description: '(Same for all)',
											},
											{
												label: 'Session',
												value: `${entry.sessionId.slice(0, 12)}...`,
												description: '(Unique)',
											},
										].map((item) => (
											<Fragment key={item.label}>
												<span className="text-gray-500">{item.label}</span>
												<span className="text-gray-200 font-medium">{item.value}</span>
												<span className="text-gray-500 text-xs">
													{item.description}
												</span>
											</Fragment>
										))}
									</div>
								</button>
							))
						) : (
							<div className="text-gray-600 text-sm py-2 px-3">History will appear here</div>
						)}
					</div>
				</div>

				<div className="bg-black border border-gray-900 rounded-lg p-8">
					<h3 className="text-white text-xl font-normal leading-none m-0 mb-6">Next Steps</h3>

					<div className="flex flex-col gap-6">
						{[
							{
								key: 'customize-agent',
								title: 'Customize your agent',
								text: (
									<>
										Edit <code className="text-white">src/agent/translate/agent.ts</code>{' '}
										to change how your agent responds.
									</>
								),
							},
							{
								key: 'add-routes',
								title: 'Add new API routes',
								text: (
									<>
										Create new files in <code className="text-white">src/api/</code> to
										expose more endpoints.
									</>
								),
							},
							{
								key: 'update-frontend',
								title: 'Update the frontend',
								text: (
									<>
										Modify <code className="text-white">src/web/App.tsx</code> to build
										your custom UI with Tailwind CSS.
									</>
								),
							},
							WORKBENCH_PATH
								? {
										key: 'workbench',
										title: (
											<>
												Try{' '}
												<a href={WORKBENCH_PATH} className="underline relative">
													Workbench
												</a>
											</>
										),
										text: <>Test the translate agent directly in the dev UI.</>,
									}
								: null,
						]
							.filter((step): step is NonNullable<typeof step> => Boolean(step))
							.map((step) => (
								<div key={step.key} className="items-start flex gap-3">
									<div className="items-center bg-green-950 border border-green-500 rounded flex size-4 shrink-0 justify-center">
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
											<path d="M20 6 9 17l-5-5"></path>
										</svg>
									</div>

									<div>
										<h4 className="text-white text-sm font-normal -mt-0.5 mb-0.5">
											{step.title}
										</h4>

										<p className="text-gray-400 text-xs">{step.text}</p>
									</div>
								</div>
							))}
					</div>
				</div>
			</div>
		</div>
	);
}
