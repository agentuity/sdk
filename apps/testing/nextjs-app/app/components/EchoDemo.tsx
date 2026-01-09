'use client';

import { useState } from 'react';
import { useAPI, AgentuityProvider } from '@agentuity/react';
import '@agentuity/routes';

function EchoDemoInner() {
	const [message, setMessage] = useState('Hello from Next.js!');
	const { data, invoke, isLoading, error } = useAPI('POST /api/echo');

	return (
		<div className="p-8">
			<h1 className="text-2xl font-bold mb-4">Agentuity + Next.js Demo</h1>
			<div className="space-y-4">
				<input
					value={message}
					onChange={(e) => setMessage(e.target.value)}
					className="border p-2 rounded w-full"
				/>
				<button
					onClick={() => invoke({ message })}
					disabled={isLoading}
					className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
				>
					{isLoading ? 'Sending...' : 'Send Echo'}
				</button>
				{error && <p className="text-red-500">Error: {error.message}</p>}
				{data && (
					<div className="bg-green-100 p-4 rounded">
						<p>
							<strong>Echo:</strong> {data.echo}
						</p>
						<p>
							<strong>Timestamp:</strong> {data.timestamp}
						</p>
					</div>
				)}
			</div>
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
