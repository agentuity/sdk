import React, { useState, useContext } from 'react';
import { AgentuityContext } from '@agentuity/react';
import type { WorkbenchInstance } from './types';
import { Button } from './components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from './components/ui/card';
import { cn } from './lib/utils';

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
		<div className={cn('p-8', className)}>
			<Card>
				<CardHeader>
					<CardTitle>Workbench</CardTitle>
					<CardDescription>Route: {workbench.config.route}</CardDescription>
				</CardHeader>

				<CardContent className="space-y-4">
					<Button onClick={handleApiCall} disabled={status === 'loading'}>
						{status === 'loading' ? 'Loading...' : 'Hit API'}
					</Button>
				</CardContent>

				<CardFooter className="flex-col items-start space-y-2">
					<h4 className="font-semibold">Response:</h4>
					<pre className="bg-muted p-4 rounded-md overflow-auto w-full text-sm">
						{response ? JSON.stringify(response, null, 2) : 'No response yet'}
					</pre>
				</CardFooter>
			</Card>
		</div>
	);
}
