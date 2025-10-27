import React, { type ChangeEvent, useState } from 'react';
import { AgentuityProvider, useAgent } from '@agentuity/react';

export function App() {
	const [name, setName] = useState('World');
	const { run, running, data: greeting } = useAgent('hello');

	return (
		<div
			style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: '600px', margin: '0 auto' }}
		>
			<AgentuityProvider>
				<h1>Welcome to Agentuity</h1>
				<p>Your new Agentuity project is ready to go!</p>

				<div style={{ marginTop: '2rem' }}>
					<h2>Try the Hello Agent</h2>
					<div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
						<input
							type="text"
							value={name}
							disabled={running}
							onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.currentTarget.value)}
							placeholder="Enter your name"
							style={{ padding: '0.5rem', flex: 1 }}
						/>
						<button
							disabled={running}
							onClick={() => run({ name })}
							style={{ padding: '0.5rem 1rem' }}
						>
							{running ? 'Running ...' : 'Say Hello'}
						</button>
					</div>
					{greeting && (
						<div
							style={{
								padding: '1rem',
								backgroundColor: '#f0f0f0',
								borderRadius: '4px',
								marginTop: '1rem',
							}}
						>
							{greeting}
						</div>
					)}
				</div>

				<div
					style={{
						marginTop: '2rem',
						padding: '1rem',
						backgroundColor: '#e8f4f8',
						borderRadius: '4px',
					}}
				>
					<h3>Next Steps:</h3>
					<ul>
						<li>
							Edit <code>src/agents/hello/agent.ts</code> to customize your agent
						</li>
						<li>
							Add new routes in <code>src/apis/</code>
						</li>
						<li>
							Customize this page in <code>src/web/app.tsx</code>
						</li>
					</ul>
				</div>
			</AgentuityProvider>
		</div>
	);
}
