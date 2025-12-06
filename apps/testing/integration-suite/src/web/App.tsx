import { useState, useEffect } from 'react';

interface TestInfo {
	name: string;
}

interface SuiteInfo {
	name: string;
	tests: TestInfo[];
	count: number;
}

interface TestResult {
	test: string;
	passed: boolean;
	error?: string;
	stack?: string;
	duration: number;
}

interface Summary {
	total: number;
	passed: number;
	failed: number;
	duration: number;
}

function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${ms.toFixed(0)}ms`;
	} else if (ms < 60000) {
		return `${(ms / 1000).toFixed(1)}s`;
	} else {
		const minutes = Math.floor(ms / 60000);
		const seconds = Math.floor((ms % 60000) / 1000);
		return `${minutes}m ${seconds}s`;
	}
}

export function App() {
	const [suites, setSuites] = useState<SuiteInfo[]>([]);
	const [loading, setLoading] = useState(true);
	const [running, setRunning] = useState(false);
	const [results, setResults] = useState<Map<string, TestResult>>(new Map());
	const [summary, setSummary] = useState<Summary | null>(null);
	const [expandedSuites, setExpandedSuites] = useState<Set<string>>(new Set());
	const [lastActivity, setLastActivity] = useState<string>('');

	useEffect(() => {
		fetch('/api/test/list')
			.then((res) => res.json())
			.then((data: { suites: SuiteInfo[] }) => {
				setSuites(data.suites);
				setLoading(false);
			})
			.catch((err) => {
				console.error('Failed to load tests:', err);
				setLoading(false);
			});
	}, []);

	const runTests = (suite?: string, test?: string) => {
		setRunning(true);
		setResults(new Map());
		setSummary(null);
		setLastActivity('');

		// Auto-expand all suites when running all tests
		if (!suite && !test) {
			setExpandedSuites(new Set(suites.map((s) => s.name)));
		}

		const params = new URLSearchParams();
		if (suite) params.set('suite', suite);
		if (test) params.set('test', test);
		params.set('concurrency', '10');

		const url = `/api/test/run?${params.toString()}`;
		const eventSource = new EventSource(url);

		eventSource.addEventListener('progress', (e: Event) => {
			const data = JSON.parse((e as MessageEvent).data);
			setLastActivity(data.test);
			setResults((prev) => {
				const next = new Map(prev);
				next.set(data.test, {
					test: data.test,
					passed: data.passed,
					error: data.error,
					stack: data.stack,
					duration: data.duration,
				});
				
				// Check if suite is complete and all passed
				const suiteName = data.test.split(':')[0];
				const suiteInfo = suites.find((s) => s.name === suiteName);
				if (suiteInfo) {
					const suiteTests = suiteInfo.tests.map((t) => `${suiteName}:${t.name}`);
					const suiteComplete = suiteTests.every((testKey) => next.has(testKey));
					const allPassed = suiteTests.every((testKey) => next.get(testKey)?.passed);
					
					// Auto-collapse suite if all tests passed
					if (suiteComplete && allPassed) {
						setExpandedSuites((prevExpanded) => {
							const nextExpanded = new Set(prevExpanded);
							nextExpanded.delete(suiteName);
							return nextExpanded;
						});
					}
				}
				
				return next;
			});
		});

		eventSource.addEventListener('complete', (e: Event) => {
			const data = JSON.parse((e as MessageEvent).data);
			setSummary(data.summary);
			setRunning(false);
			eventSource.close();
		});

		eventSource.onerror = () => {
			setRunning(false);
			eventSource.close();
		};
	};

	const toggleSuite = (suiteName: string) => {
		setExpandedSuites((prev) => {
			const next = new Set(prev);
			if (next.has(suiteName)) {
				next.delete(suiteName);
			} else {
				next.add(suiteName);
			}
			return next;
		});
	};

	const getTestResult = (suite: string, test: string) => {
		return results.get(`${suite}:${test}`);
	};

	if (loading) {
		return (
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					minHeight: '100vh',
					color: '#a1a1aa',
				}}
			>
				Loading tests...
			</div>
		);
	}

	return (
		<div style={{ minHeight: '100vh', padding: '2rem' }}>
			<div style={{ maxWidth: '80rem', margin: '0 auto' }}>
				{/* Header */}
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						flexDirection: 'column',
						gap: '0.5rem',
						marginBottom: '3rem',
						textAlign: 'center',
					}}
				>
					<svg
						aria-hidden="true"
						fill="none"
						height="191"
						style={{ height: 'auto', width: '3rem', marginBottom: '1rem' }}
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

					<h1 style={{ fontSize: '3rem', fontWeight: 100, margin: 0 }}>
						Integration Test Suite
					</h1>

					<p style={{ color: '#a1a1aa', fontSize: '1.15rem', margin: 0 }}>
						Comprehensive SDK Validation & Testing
					</p>

					<div className="glow-btn" style={{ marginTop: '1.5rem', position: 'relative', zIndex: 1 }}>
						<div
							className="glow-bg"
							style={{
								background: 'linear-gradient(to right, #155e75, #3b82f6, #9333ea)',
								borderRadius: '0.5rem',
								position: 'absolute',
								inset: 0,
							}}
						/>
						<button
							onClick={() => runTests()}
							disabled={running}
							style={{
								backgroundColor: '#030712',
								border: 'none',
								borderRadius: '0.5rem',
								color: '#fff',
								cursor: running ? 'not-allowed' : 'pointer',
								opacity: running ? 0.5 : 1,
								padding: '0.75rem 2rem',
								position: 'relative',
								fontSize: '1rem',
								fontWeight: 400,
								transition: 'opacity 0.2s',
							}}
						>
							{running ? 'Running Tests...' : 'Run All Tests'}
						</button>
					</div>

					{/* Live Activity Indicator */}
					{running && lastActivity && (
						<div
							style={{
								marginTop: '1rem',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								gap: '0.75rem',
								color: '#a1a1aa',
								fontSize: '0.875rem',
							}}
						>
							<div
								style={{
									width: '1rem',
									height: '1rem',
									border: '2px solid #22d3ee',
									borderTopColor: 'transparent',
									borderRadius: '50%',
									animation: 'spin 0.8s linear infinite',
								}}
							/>
							<span style={{ fontFamily: 'monospace', color: '#22d3ee' }}>
								{lastActivity}
							</span>
						</div>
					)}
				</div>

				{/* Summary */}
				{summary && (
					<div
						style={{
							background: '#000',
							border: '1px solid #18181b',
							borderRadius: '0.5rem',
							padding: '2rem',
							marginBottom: '2rem',
							boxShadow: '0 1.5rem 3rem -0.75rem #00000040',
						}}
					>
						<h2 style={{ fontSize: '1.25rem', fontWeight: 400, marginBottom: '1.5rem', color: '#fff' }}>
							Test Results
						</h2>
						<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2rem' }}>
							<div>
								<div style={{ color: '#a1a1aa', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
									Total
								</div>
								<div style={{ fontSize: '2.5rem', fontWeight: 100, color: '#fff' }}>
									{summary.total}
								</div>
							</div>
							<div>
								<div style={{ color: '#a1a1aa', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
									Passed
								</div>
								<div style={{ fontSize: '2.5rem', fontWeight: 100, color: '#00c951' }}>
									{summary.passed}
								</div>
							</div>
							<div>
								<div style={{ color: '#a1a1aa', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
									Failed
								</div>
								<div style={{ fontSize: '2.5rem', fontWeight: 100, color: '#ef4444' }}>
									{summary.failed}
								</div>
							</div>
							<div>
								<div style={{ color: '#a1a1aa', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
									Duration
								</div>
								<div style={{ fontSize: '2.5rem', fontWeight: 100, color: '#22d3ee' }}>
									{formatDuration(summary.duration)}
								</div>
							</div>
						</div>
					</div>
				)}

				{/* Test Suites */}
				<div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
					{suites.map((suite) => {
						const isExpanded = expandedSuites.has(suite.name);
						const suiteResults = suite.tests
							.map((t) => getTestResult(suite.name, t.name))
							.filter((r) => r !== undefined);
						const suitePassed = suiteResults.filter((r) => r?.passed).length;
						const suiteFailed = suiteResults.filter((r) => !r?.passed).length;

						return (
							<div
								key={suite.name}
								style={{
									background: '#000',
									border: '1px solid #18181b',
									borderRadius: '0.5rem',
									overflow: 'hidden',
								}}
							>
								{/* Suite Header */}
								<div
									style={{
										padding: '1.5rem',
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'space-between',
										borderBottom: isExpanded ? '1px solid #18181b' : 'none',
									}}
								>
									<div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
										<button
											onClick={() => toggleSuite(suite.name)}
											style={{
												background: 'none',
												border: 'none',
												color: '#a1a1aa',
												cursor: 'pointer',
												padding: 0,
												display: 'flex',
												alignItems: 'center',
											}}
										>
											<span
												style={{
													transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
													transition: 'transform 0.2s',
													display: 'inline-block',
												}}
											>
												▶
											</span>
										</button>
										<h3 style={{ fontSize: '1.125rem', fontWeight: 400, color: '#fff' }}>
											{suite.name}
										</h3>
										<span style={{ color: '#a1a1aa', fontSize: '0.875rem' }}>
											{suite.count} tests
										</span>
										{suiteResults.length > 0 && (
											<div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.875rem' }}>
												{suitePassed > 0 && (
													<span style={{ color: '#00c951' }}>✓ {suitePassed}</span>
												)}
												{suiteFailed > 0 && (
													<span style={{ color: '#ef4444' }}>✗ {suiteFailed}</span>
												)}
											</div>
										)}
									</div>
									<button
										onClick={() => runTests(suite.name)}
										disabled={running}
										style={{
											backgroundColor: running ? '#18181b' : '#09090b',
											border: '1px solid #2b2b30',
											borderRadius: '0.375rem',
											color: running ? '#52525b' : '#a1a1aa',
											cursor: running ? 'not-allowed' : 'pointer',
											padding: '0.5rem 1rem',
											fontSize: '0.875rem',
											transition: 'all 0.2s',
										}}
									>
										Run Suite
									</button>
								</div>

								{/* Suite Tests */}
								{isExpanded && (
									<div>
										{suite.tests.map((test) => {
											const result = getTestResult(suite.name, test.name);
											const testKey = `${suite.name}:${test.name}`;
											const isRecentlyCompleted = lastActivity === testKey;
											const isRunningNow = running && !result;

											return (
												<div
													key={testKey}
													style={{
														padding: '1rem 1.5rem',
														borderTop: '1px solid #18181b',
														display: 'flex',
														alignItems: 'flex-start',
														justifyContent: 'space-between',
														gap: '1rem',
														backgroundColor: isRecentlyCompleted
															? '#0a2a3a'
															: 'transparent',
														transition: 'background-color 0.3s ease-out',
														position: 'relative',
													}}
												>
													<div
														style={{
															display: 'flex',
															gap: '1rem',
															flex: 1,
															minWidth: 0,
														}}
													>
														{/* Status Icon */}
														<div style={{ flexShrink: 0, marginTop: '0.125rem' }}>
															{isRunningNow ? (
																<div
																	style={{
																		width: '1rem',
																		height: '1rem',
																		borderRadius: '0.25rem',
																		border: '1px solid #3b82f6',
																		display: 'flex',
																		alignItems: 'center',
																		justifyContent: 'center',
																		animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
																	}}
																>
																	<span
																		style={{
																			color: '#3b82f6',
																			fontSize: '0.65rem',
																		}}
																	>
																		⋯
																	</span>
																</div>
															) : result ? (
																result.passed ? (
																	<div
																		style={{
																			width: '1rem',
																			height: '1rem',
																			borderRadius: '0.25rem',
																			backgroundColor: '#002810',
																			border: '1px solid #00c951',
																			display: 'flex',
																			alignItems: 'center',
																			justifyContent: 'center',
																		}}
																	>
																		<span
																			style={{
																				color: '#00c951',
																				fontSize: '0.65rem',
																			}}
																		>
																			✓
																		</span>
																	</div>
																) : (
																	<div
																		style={{
																			width: '1rem',
																			height: '1rem',
																			borderRadius: '0.25rem',
																			backgroundColor: '#3f0e0e',
																			border: '1px solid #ef4444',
																			display: 'flex',
																			alignItems: 'center',
																			justifyContent: 'center',
																		}}
																	>
																		<span
																			style={{
																				color: '#ef4444',
																				fontSize: '0.65rem',
																			}}
																		>
																			✗
																		</span>
																	</div>
																)
															) : (
																<div
																	style={{
																		width: '1rem',
																		height: '1rem',
																		borderRadius: '0.25rem',
																		border: '1px solid #2b2b30',
																	}}
																/>
															)}
														</div>

														{/* Test Name and Error */}
														<div style={{ flex: 1, minWidth: 0 }}>
															<div
																style={{
																	color: '#fff',
																	fontSize: '0.875rem',
																	marginBottom: result?.error ? '0.5rem' : 0,
																}}
															>
																{test.name}
															</div>
															{result?.error && (
																<div
																	style={{
																		background: '#3f0e0e',
																		border: '1px solid #5c0f0f',
																		borderRadius: '0.375rem',
																		padding: '0.75rem',
																		fontSize: '0.75rem',
																		fontFamily: 'monospace',
																		color: '#fca5a5',
																	}}
																>
																	<div
																		style={{
																			fontWeight: 600,
																			marginBottom: '0.25rem',
																		}}
																	>
																		Error:
																	</div>
																	<div>{result.error}</div>
																	{result.stack && (
																		<details
																			style={{
																				marginTop: '0.5rem',
																				cursor: 'pointer',
																			}}
																		>
																			<summary style={{ color: '#ef4444' }}>
																				Stack trace
																			</summary>
																			<pre
																				style={{
																					marginTop: '0.5rem',
																					fontSize: '0.65rem',
																					overflow: 'auto',
																					whiteSpace: 'pre-wrap',
																					wordBreak: 'break-all',
																				}}
																			>
																				{result.stack}
																			</pre>
																		</details>
																	)}
																</div>
															)}
														</div>

														{/* Duration */}
														{result && (
															<div
																style={{
																	color: '#a1a1aa',
																	fontSize: '0.75rem',
																	flexShrink: 0,
																	marginTop: '0.125rem',
																}}
															>
																{formatDuration(result.duration)}
															</div>
														)}
													</div>

													<button
														onClick={() => runTests(suite.name, test.name)}
														disabled={running}
														style={{
															backgroundColor: running ? '#18181b' : '#09090b',
															border: '1px solid #2b2b30',
															borderRadius: '0.375rem',
															color: running ? '#52525b' : '#a1a1aa',
															cursor: running ? 'not-allowed' : 'pointer',
															padding: '0.375rem 0.75rem',
															fontSize: '0.75rem',
															flexShrink: 0,
															transition: 'all 0.2s',
														}}
													>
														Run
													</button>
												</div>
											);
										})}
									</div>
								)}
							</div>
						);
					})}
				</div>
			</div>

			<style>
				{`.glow-btn .glow-bg {
					filter: blur(1.25rem);
					opacity: 0.75;
					transition: all 700ms;
				}
				.glow-btn:hover .glow-bg {
					filter: blur(2rem);
					opacity: 1;
				}
				@keyframes spin {
					from { transform: rotate(0deg); }
					to { transform: rotate(360deg); }
				}
				@keyframes pulse {
					0%, 100% { opacity: 1; }
					50% { opacity: 0.3; }
				}`}
			</style>
		</div>
	);
}
