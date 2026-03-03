'use client';

import { useState } from 'react';
import { useAPI, AgentuityProvider } from '@agentuity/react';
import '@agentuity/routes';

function AgentuityLogo() {
	return (
		<svg
			aria-hidden="true"
			aria-label="Agentuity Logo"
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

function NextJsLogo() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 180 180"
			style={{ height: '2.5rem', width: '2.5rem' }}
		>
			<mask
				id="mask0"
				maskUnits="userSpaceOnUse"
				x="0"
				y="0"
				width="180"
				height="180"
				style={{ maskType: 'alpha' }}
			>
				<circle cx="90" cy="90" r="90" fill="black" />
			</mask>
			<g mask="url(#mask0)">
				<circle cx="90" cy="90" r="90" fill="black" stroke="white" strokeWidth="6" />
				<path
					d="M149.508 157.52L69.142 54H54V125.97H66.1136V69.3836L139.999 164.845C143.333 162.614 146.509 160.165 149.508 157.52Z"
					fill="url(#paint0_linear)"
				/>
				<rect x="115" y="54" width="12" height="72" fill="url(#paint1_linear)" />
			</g>
			<defs>
				<linearGradient
					id="paint0_linear"
					x1="109"
					y1="116.5"
					x2="144.5"
					y2="160.5"
					gradientUnits="userSpaceOnUse"
				>
					<stop stopColor="white" />
					<stop offset="1" stopColor="white" stopOpacity="0" />
				</linearGradient>
				<linearGradient
					id="paint1_linear"
					x1="121"
					y1="54"
					x2="120.799"
					y2="106.875"
					gradientUnits="userSpaceOnUse"
				>
					<stop stopColor="white" />
					<stop offset="1" stopColor="white" stopOpacity="0" />
				</linearGradient>
			</defs>
		</svg>
	);
}

function EchoDemoInner() {
	const [message, setMessage] = useState('Hello from Next.js!');
	const { data, invoke, isLoading, error } = useAPI('POST /api/echo');

	return (
		<div className="app-container">
			<div className="content-wrapper">
				<div className="header">
					<div className="logos">
						<AgentuityLogo />
						<span className="plus">+</span>
						<NextJsLogo />
					</div>

					<h1 className="title">Agentuity + Next.js</h1>
					<p className="subtitle">End-to-end type-safe API integration demo</p>
				</div>

				<div className="card card-interactive">
					<h2 className="card-title">
						Try the <span className="highlight">Echo Agent</span>
					</h2>

					<div className="input-group">
						<input
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

					{error && <div className="error">Error: {error.message}</div>}

					<div className="output" data-loading={!data}>
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
					<h3 className="section-title">Type Safety Demo</h3>
					<div className="code-block">
						<code>{`const { data, invoke } = useAPI('POST /api/echo');
// TypeScript knows:
// - invoke({ message: string })
// - data.echo: string
// - data.timestamp: string`}</code>
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

export default function EchoDemo() {
	return (
		<AgentuityProvider>
			<EchoDemoInner />
		</AgentuityProvider>
	);
}
