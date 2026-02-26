import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'agentuity-ai-search-history';

export interface AIMessage {
	id: string;
	type: 'user' | 'ai';
	content: string;
	timestamp: Date;
	sources?: Array<{
		id: string;
		title: string;
		url: string;
	}>;
}

interface DocQaResponse {
	answer: string;
	documents?: Array<{
		url: string;
		title: string;
	}>;
}

async function queryDocQa(message: string): Promise<DocQaResponse> {
	const response = await fetch('/api/doc-qa', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ message }),
	});

	if (!response.ok) {
		throw new Error(`API request failed: ${response.status}`);
	}

	return response.json();
}

export function useAISearch() {
	const [messages, setMessages] = useState<AIMessage[]>(() => {
		try {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved) {
				const parsed = JSON.parse(saved) as AIMessage[];
				return parsed.map((msg) => ({
					...msg,
					timestamp: new Date(msg.timestamp),
				}));
			}
		} catch {
			// Ignore corrupted storage
		}
		return [];
	});
	const [loading, setLoading] = useState(false);

	// Persist messages to localStorage
	useEffect(() => {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
		} catch {
			// Storage full or unavailable
		}
	}, [messages]);

	const sendMessage = useCallback(async (query: string) => {
		const trimmed = query.trim();
		if (!trimmed) return;

		const userMessage: AIMessage = {
			id: `user-${Date.now()}`,
			type: 'user',
			content: trimmed,
			timestamp: new Date(),
		};

		setMessages((prev) => [...prev, userMessage]);
		setLoading(true);

		try {
			const result = await queryDocQa(trimmed);

			if (result?.answer) {
				const aiMessage: AIMessage = {
					id: `ai-${Date.now()}`,
					type: 'ai',
					content: result.answer,
					timestamp: new Date(),
					sources:
						result.documents && result.documents.length > 0
							? result.documents.map((doc, i) => ({
									id: `doc-${Date.now()}-${i}`,
									title: doc.title,
									url: doc.url || '#',
								}))
							: undefined,
				};
				setMessages((prev) => [...prev, aiMessage]);
			} else {
				setMessages((prev) => [
					...prev,
					{
						id: `ai-${Date.now()}`,
						type: 'ai' as const,
						content:
							"I couldn't find a relevant answer to your question. Please try rephrasing or check our documentation directly.",
						timestamp: new Date(),
					},
				]);
			}
		} catch {
			setMessages((prev) => [
				...prev,
				{
					id: `ai-${Date.now()}`,
					type: 'ai' as const,
					content: 'Sorry, I encountered an error while searching. Please try again.',
					timestamp: new Date(),
				},
			]);
		} finally {
			setLoading(false);
		}
	}, []);

	const handleClear = useCallback(() => {
		setMessages([]);
		setLoading(false);
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			// Ignore
		}
	}, []);

	const handleRetry = useCallback(() => {
		const lastUserMessage = [...messages].reverse().find((m) => m.type === 'user');
		if (lastUserMessage) {
			sendMessage(lastUserMessage.content);
		}
	}, [messages, sendMessage]);

	return {
		messages,
		loading,
		sendMessage,
		handleClear,
		handleRetry,
	};
}
