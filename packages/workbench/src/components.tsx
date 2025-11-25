import React, { useState, useContext } from 'react';
import { AgentuityContext } from '@agentuity/react';
import type { WorkbenchInstance } from './types';

export interface WorkbenchProps {
	workbench: WorkbenchInstance;
	className?: string;
}

export function Workbench({ workbench, className }: WorkbenchProps) {
	const { baseUrl } = useContext(AgentuityContext);
	const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
	const [response, setResponse] = useState<unknown>(null);

	const handleApiCall = async () => {
		setStatus('loading');
		try {
			const url = `${baseUrl}/api`;
			const res = await fetch(url, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
					...workbench.config.headers,
				},
			});

			if (!res.ok) {
				throw new Error(`HTTP ${res.status}: ${res.statusText}`);
			}

			const data = await res.json();
			setResponse(data);
			setStatus('success');
		} catch (error) {
			console.error('API call failed:', error);
			setResponse({ error: error instanceof Error ? error.message : 'Unknown error' });
			setStatus('error');
		}
	};

	return (
		<div className={`workbench ${className || ''}`}>
			<div className="workbench-header">
				<h3>Workbench</h3>
				<p>Route: {workbench.config.route}</p>
			</div>

			<div className="workbench-controls">
				<button onClick={handleApiCall} disabled={status === 'loading'}>
					{status === 'loading' ? 'Loading...' : 'Hit API'}
				</button>
			</div>

			<div className="workbench-response">
				<h4>Response:</h4>
				<pre
					style={{
						background: '#f5f5f5',
						padding: '10px',
						borderRadius: '4px',
						overflow: 'auto',
					}}
				>
					{response ? JSON.stringify(response, null, 2) : 'No response yet'}
				</pre>
			</div>
		</div>
	);
}
