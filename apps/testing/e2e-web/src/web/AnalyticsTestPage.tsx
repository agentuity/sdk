import { useState, useEffect, useRef } from 'react';

declare global {
	interface Window {
		__AGENTUITY_ANALYTICS__?: {
			enabled: boolean;
			orgId: string;
			projectId: string;
			isDevmode: boolean;
			trackClicks?: boolean;
			trackScroll?: boolean;
			trackErrors?: boolean;
			trackWebVitals?: boolean;
			trackSPANavigation?: boolean;
		};
		agentuityAnalytics?: {
			track: (name: string, properties?: Record<string, unknown>) => void;
			flush: () => void;
		};
	}
}

interface TestResult {
	name: string;
	status: 'pending' | 'pass' | 'fail';
	message?: string;
}

export function AnalyticsTestPage() {
	const [results, setResults] = useState<TestResult[]>([]);
	const [consoleMessages, setConsoleMessages] = useState<string[]>([]);
	const originalDebugRef = useRef<typeof console.debug | null>(null);

	const updateResult = (name: string, status: 'pass' | 'fail', message?: string) => {
		setResults((prev) => prev.map((r) => (r.name === name ? { ...r, status, message } : r)));
	};

	const runTests = async () => {
		const tests: TestResult[] = [
			{ name: 'Analytics config injected', status: 'pending' },
			{ name: 'Analytics enabled', status: 'pending' },
			{ name: 'Dev mode detected', status: 'pending' },
			{ name: 'Beacon API available', status: 'pending' },
			{ name: 'Pageview event logged', status: 'pending' },
			{ name: 'Custom event logged', status: 'pending' },
			{ name: 'Click tracking works', status: 'pending' },
		];
		setResults(tests);
		setConsoleMessages([]);

		// Intercept console.debug to capture analytics logs
		originalDebugRef.current = console.debug;
		const capturedLogs: string[] = [];
		console.debug = (...args: unknown[]) => {
			const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
			if (msg.includes('Agentuity Analytics')) {
				capturedLogs.push(msg);
				setConsoleMessages((prev) => [...prev, msg]);
			}
			originalDebugRef.current?.apply(console, args);
		};

		// Test 1: Analytics config injected
		await new Promise((r) => setTimeout(r, 100));
		const config = window.__AGENTUITY_ANALYTICS__;
		if (config) {
			updateResult(
				'Analytics config injected',
				'pass',
				`Found config with orgId: ${config.orgId || '(empty)'}`
			);
		} else {
			updateResult(
				'Analytics config injected',
				'fail',
				'window.__AGENTUITY_ANALYTICS__ not found'
			);
		}

		// Test 2: Analytics enabled
		if (config?.enabled) {
			updateResult('Analytics enabled', 'pass');
		} else {
			updateResult('Analytics enabled', 'fail', 'enabled=false or config missing');
		}

		// Test 3: Dev mode detected
		if (config?.isDevmode) {
			updateResult('Dev mode detected', 'pass', 'isDevmode=true (logs to console)');
		} else {
			updateResult('Dev mode detected', 'fail', 'isDevmode=false (would send to server)');
		}

		// Test 4: Beacon API available
		const beaconApi = window.agentuityAnalytics;
		if (beaconApi && typeof beaconApi.track === 'function') {
			updateResult('Beacon API available', 'pass', 'window.agentuityAnalytics.track() exists');
		} else {
			updateResult('Beacon API available', 'fail', 'window.agentuityAnalytics not found');
		}

		// Test 5: Check for pageview event (should have fired on page load)
		await new Promise((r) => setTimeout(r, 500));
		const hasPageview = capturedLogs.some((log) => log.includes('pageview'));
		if (hasPageview) {
			updateResult('Pageview event logged', 'pass', 'Found pageview in console');
		} else {
			updateResult('Pageview event logged', 'fail', 'No pageview event found in console');
		}

		// Test 6: Custom event
		if (beaconApi) {
			beaconApi.track('test_custom_event', { testProp: 'testValue' });
			beaconApi.flush();
			await new Promise((r) => setTimeout(r, 200));
			const hasCustom = capturedLogs.some((log) => log.includes('test_custom_event'));
			if (hasCustom) {
				updateResult('Custom event logged', 'pass', 'Custom event appeared in console');
			} else {
				updateResult('Custom event logged', 'fail', 'Custom event not found in console');
			}
		} else {
			updateResult('Custom event logged', 'fail', 'Beacon API not available');
		}

		// Test 7: Click tracking - simulate click on data-analytics element
		const clickTestBtn = document.getElementById('analytics-click-test');
		if (clickTestBtn) {
			clickTestBtn.click();
			await new Promise((r) => setTimeout(r, 200));
			const hasClick = capturedLogs.some(
				(log) => log.includes('click') || log.includes('test_button_click')
			);
			if (hasClick) {
				updateResult('Click tracking works', 'pass', 'Click event logged');
			} else {
				updateResult('Click tracking works', 'fail', 'Click event not found');
			}
		} else {
			updateResult('Click tracking works', 'fail', 'Test button not found');
		}

		// Restore console.debug
		if (originalDebugRef.current) {
			console.debug = originalDebugRef.current;
		}
	};

	useEffect(() => {
		// Wait for analytics to initialize
		const timer = setTimeout(runTests, 1000);
		return () => {
			clearTimeout(timer);
			// Restore console.debug on unmount
			if (originalDebugRef.current) {
				console.debug = originalDebugRef.current;
				originalDebugRef.current = null;
			}
		};
	}, []);

	const passCount = results.filter((r) => r.status === 'pass').length;
	const failCount = results.filter((r) => r.status === 'fail').length;
	const pendingCount = results.filter((r) => r.status === 'pending').length;

	return (
		<div
			style={{
				padding: '2rem',
				fontFamily: 'system-ui',
				background: '#09090b',
				minHeight: '100vh',
				color: '#fff',
			}}
		>
			<h1 style={{ marginBottom: '1rem' }}>Analytics E2E Tests</h1>
			<p style={{ color: '#a1a1aa', marginBottom: '2rem' }}>
				Testing that the analytics beacon loads and fires correctly in dev mode.
			</p>

			{/* Hidden button for click tracking test */}
			<button
				id="analytics-click-test"
				data-analytics="test_button_click"
				style={{ display: 'none' }}
				type="button"
			>
				Test
			</button>

			{/* Summary */}
			<div
				style={{
					marginBottom: '2rem',
					padding: '1rem',
					background: '#18181b',
					borderRadius: '0.5rem',
				}}
			>
				<span style={{ color: '#22c55e', marginRight: '1rem' }}>✓ {passCount} passed</span>
				<span style={{ color: '#ef4444', marginRight: '1rem' }}>✗ {failCount} failed</span>
				<span style={{ color: '#a1a1aa' }}>◌ {pendingCount} pending</span>
				<button
					onClick={runTests}
					style={{
						marginLeft: '2rem',
						padding: '0.5rem 1rem',
						background: '#3b82f6',
						border: 'none',
						borderRadius: '0.25rem',
						color: '#fff',
						cursor: 'pointer',
					}}
					type="button"
				>
					Re-run Tests
				</button>
			</div>

			{/* Test Results */}
			<div style={{ marginBottom: '2rem' }}>
				<h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Test Results</h2>
				{results.map((result) => (
					<div
						key={result.name}
						style={{
							padding: '0.75rem 1rem',
							background: '#000',
							border: '1px solid #27272a',
							borderRadius: '0.25rem',
							marginBottom: '0.5rem',
							display: 'flex',
							alignItems: 'center',
							gap: '1rem',
						}}
					>
						<span
							style={{
								color:
									result.status === 'pass'
										? '#22c55e'
										: result.status === 'fail'
											? '#ef4444'
											: '#a1a1aa',
								fontWeight: 'bold',
								width: '1.5rem',
							}}
						>
							{result.status === 'pass' ? '✓' : result.status === 'fail' ? '✗' : '◌'}
						</span>
						<span style={{ flex: 1 }}>{result.name}</span>
						{result.message && (
							<span style={{ color: '#a1a1aa', fontSize: '0.875rem' }}>
								{result.message}
							</span>
						)}
					</div>
				))}
			</div>

			{/* Console Output */}
			<div>
				<h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>
					Console Output (Analytics Logs)
				</h2>
				<pre
					style={{
						background: '#000',
						border: '1px solid #27272a',
						borderRadius: '0.25rem',
						padding: '1rem',
						overflow: 'auto',
						maxHeight: '300px',
						fontSize: '0.75rem',
						color: '#22d3ee',
					}}
				>
					{consoleMessages.length > 0
						? consoleMessages.join('\n\n')
						: '(waiting for analytics events...)'}
				</pre>
			</div>

			{/* Navigation */}
			<div style={{ marginTop: '2rem' }}>
				<a href="/" style={{ color: '#3b82f6' }}>
					← Back to Home
				</a>
			</div>
		</div>
	);
}
