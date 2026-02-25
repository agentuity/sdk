'use client';

import { useState } from 'react';
import { useAPI, AgentuityProvider } from '@agentuity/react';
import { isStructuredError } from '@agentuity/core';
import '@agentuity/routes';

function AgentuityLogo() {
	return (
		<svg
			aria-hidden="true"
			fill="none"
			height="191"
			viewBox="0 0 220 191"
			width="220"
			xmlns="http://www.w3.org/2000/svg"
			style={{ height: 'auto', width: '3rem' }}
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
	);
}

function ViteLogo() {
	return (
		<svg
			aria-hidden="true"
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 410 404"
			style={{ height: '2.5rem', width: '2.5rem' }}
		>
			<path
				d="M399.641 59.5246L215.643 388.545C211.844 395.338 202.084 395.378 198.228 388.618L10.5817 59.5246C6.38087 52.1901 12.6802 43.2898 21.0281 44.6916L205.223 75.8396C206.398 76.0399 207.601 76.0399 208.776 75.8396L389.272 44.6916C397.62 43.2898 403.919 52.1901 399.641 59.5246Z"
				fill="url(#paint0_linear)"
			/>
			<path
				d="M292.965 1.5744L156.801 28.2552C154.563 28.6937 152.906 30.5903 152.771 32.8664L144.395 174.33C144.198 177.662 147.258 180.248 150.51 179.498L188.42 170.749C191.967 169.931 195.172 172.945 194.443 176.512L182.534 236.339C181.795 240.012 185.194 243.08 188.77 242.042L212.056 235.296C215.635 234.256 219.037 237.332 218.292 241.007L201.587 322.48C200.612 327.208 207.133 329.993 209.841 325.985L211.847 322.942L323.797 96.1073C325.698 92.2995 322.083 88.1932 317.938 89.3964L279.166 100.751C275.499 101.806 272.261 98.5619 273.44 94.9291L298.668 14.0606C299.847 10.4278 296.613 7.17156 292.965 1.5744Z"
				fill="url(#paint1_linear)"
			/>
			<defs>
				<linearGradient
					id="paint0_linear"
					x1="6.00017"
					y1="32.9999"
					x2="235"
					y2="344"
					gradientUnits="userSpaceOnUse"
				>
					<stop stopColor="#41D1FF" />
					<stop offset="1" stopColor="#BD34FE" />
				</linearGradient>
				<linearGradient
					id="paint1_linear"
					x1="194.651"
					y1="8.81818"
					x2="236.076"
					y2="292.989"
					gradientUnits="userSpaceOnUse"
				>
					<stop stopColor="#FF3E00" />
					<stop offset="1" stopColor="#FF9900" />
				</linearGradient>
			</defs>
		</svg>
	);
}

function EchoDemoInner() {
	const [message, setMessage] = useState('Hello from Vite RSC!');
	const { data, invoke, isLoading, error } = useAPI('POST /api/echo');

	return (
		<div className="app-container">
			<div className="content-wrapper">
				<div className="header">
					<div className="logos">
						<AgentuityLogo />
						<span className="plus">+</span>
						<ViteLogo />
					</div>

					<h1 className="title">Agentuity + Vite RSC</h1>
					<p className="subtitle">React Server Components with Agentuity integration</p>
				</div>

				<div className="card card-interactive">
					<h2 className="card-title">
						Try the <span className="highlight">Echo Agent</span>
					</h2>

					<div className="input-group">
						<input
							aria-label="Message to echo"
							className="input"
							disabled={isLoading}
							onChange={(e) => setMessage(e.target.value)}
							placeholder="Enter a message..."
							type="text"
							value={message}
						/>

						<div className="glow-btn">
							<div className="glow-bg" />
							<div className="glow-effect" />
							<button
								className={`button ${isLoading ? 'disabled' : ''}`}
								disabled={isLoading || !message.trim()}
								onClick={() => invoke({ message })}
								type="button"
							>
								{isLoading ? 'Sending...' : 'Send Echo'}
							</button>
						</div>
					</div>

					{error && <div className="error">Error: {isStructuredError(error) ? error.message : 'Request failed'}</div>}

					<div className="output" data-loading={isLoading}>
						{data ? (
							<>
								<div>
									<strong>Echo:</strong> {data.echo}
								</div>
								<div className="timestamp">
									<strong>Timestamp:</strong> {data.timestamp}
								</div>
							</>
						) : (
							'Waiting for request'
						)}
					</div>
				</div>

				<div className="card">
					<h3 className="section-title">RSC Architecture</h3>
					<div className="code-block">
						<code>{`// Server Component (runs on server)
export default function EchoDemo() {
  return <EchoDemoClient />;
}

// Client Component (runs in browser)
'use client';
const { data, invoke } = useAPI('POST /api/echo');`}</code>
					</div>
				</div>
			</div>

			<style>
				{`
					body {
						background-color: #09090b;
						margin: 0;
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
						padding: 4rem 2rem;
						width: 100%;
					}

					.header {
						align-items: center;
						display: flex;
						flex-direction: column;
						gap: 0.5rem;
						justify-content: center;
						margin-bottom: 2rem;
						text-align: center;
					}

					.logos {
						display: flex;
						align-items: center;
						gap: 1rem;
						margin-bottom: 1rem;
					}

					.plus {
						color: #a1a1aa;
						font-size: 1.5rem;
						font-weight: 300;
					}

					.title {
						font-size: 2.5rem;
						font-weight: 100;
						margin: 0;
					}

					.subtitle {
						color: #a1a1aa;
						font-size: 1.15rem;
						margin: 0;
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
						line-height: 1;
						margin: 0;
					}

					.highlight {
						color: #fff;
					}

					.input-group {
						display: flex;
						gap: 1rem;
					}

					.input {
						background: #09090b;
						border: 1px solid #2b2b30;
						border-radius: 0.375rem;
						color: #fff;
						flex: 1;
						outline: none;
						padding: 0.75rem 1rem;
						z-index: 2;
					}

					.input:focus {
						border-color: #00FFFF;
					}

					.glow-btn {
						position: relative;
						z-index: 1;
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
						height: 100%;
						padding: 0 1.5rem;
						position: relative;
						transition: opacity 0.2s;
						white-space: nowrap;
					}

					.button.disabled {
						cursor: not-allowed;
						opacity: 0.5;
					}

					.error {
						background: #450a0a;
						border: 1px solid #dc2626;
						border-radius: 0.375rem;
						color: #fca5a5;
						padding: 0.75rem 1rem;
					}

					.output {
						background: #09090b;
						border: 1px solid #2b2b30;
						border-radius: 0.375rem;
						color: #22d3ee;
						font-family: monospace;
						line-height: 1.75;
						padding: 0.75rem 1rem;
					}

					.output[data-loading="true"] {
						color: #a1a1aa;
					}

					.timestamp {
						color: #a1a1aa;
						font-size: 0.875rem;
					}

					.section-title {
						color: #fff;
						font-size: 1.25rem;
						font-weight: 400;
						line-height: 1;
						margin: 0 0 1rem 0;
					}

					.code-block {
						background: #09090b;
						border: 1px solid #2b2b30;
						border-radius: 0.375rem;
						padding: 1rem;
						overflow-x: auto;
					}

					.code-block code {
						color: #a1a1aa;
						font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
						font-size: 0.875rem;
						white-space: pre;
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

export default function EchoDemoClient() {
	return (
		<AgentuityProvider>
			<EchoDemoInner />
		</AgentuityProvider>
	);
}
