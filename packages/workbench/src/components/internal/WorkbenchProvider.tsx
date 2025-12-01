import React, { createContext, useContext, useEffect, useState } from 'react';
import type { UIMessage } from 'ai';
import type { WorkbenchConfig } from '@agentuity/core';
import type { WorkbenchContextType } from '../../types/config';
import { useAgentSchemas } from '../../hooks/useAgentSchemas';

const WorkbenchContext = createContext<WorkbenchContextType | null>(null);

export function useWorkbench() {
	const context = useContext(WorkbenchContext);
	if (!context) {
		throw new Error('useWorkbench must be used within a WorkbenchProvider');
	}
	return context;
}

interface WorkbenchProviderProps {
	config: WorkbenchConfig;
	children: React.ReactNode;
}

export function WorkbenchProvider({ config, children }: WorkbenchProviderProps) {
	const [messages, setMessages] = useState<UIMessage[]>([]);
	const [selectedAgent, setSelectedAgent] = useState<string>('');
	const [inputMode, setInputMode] = useState<'text' | 'form'>('text');
	const [isLoading, setIsLoading] = useState(false);

	// Hardcoded config values
	const baseUrl = config.port ? `http://localhost:${config.port}` : undefined;
	const apiKey = undefined;
	const shouldUseSchemas = true;

	// Debug logging
	useEffect(() => {
		console.log('WorkbenchProvider Debug:', {
			baseUrl,
			shouldUseSchemas,
		});
	}, [baseUrl, shouldUseSchemas]);

	const {
		data: schemaData,
		isLoading: schemasLoading,
		error: schemasError,
		refetch: refetchSchemas,
	} = useAgentSchemas({
		baseUrl,
		apiKey,
		enabled: shouldUseSchemas,
	});

	// Convert schema data to Agent format, no fallback
	const agents = schemaData?.agents;
	// Log schema fetch errors for debugging
	useEffect(() => {
		if (schemasError) {
			console.warn(
				'Failed to fetch agent schemas from API, using static configuration:',
				schemasError.message
			);
		}
	}, [schemasError]);

	const [suggestions, _setSuggestions] = useState<string[]>([]);

	// Set initial agent selection
	useEffect(() => {
		if (agents && Object.keys(agents).length > 0 && !selectedAgent) {
			setSelectedAgent(Object.keys(agents)[0]);
		}
	}, [agents, selectedAgent]);

	// Fetch suggestions from API if endpoint is provided
	useEffect(() => {
		// No API endpoints hardcoded for now
	}, []);

	const _fetchSuggestions = async () => {
		// No API endpoints for now
	};

	const submitMessage = async (value: string, _mode: 'text' | 'form' = 'text') => {
		if (!value.trim()) return;

		// Add user message
		const userMessage: UIMessage = {
			id: Date.now().toString(),
			role: 'user',
			parts: [{ type: 'text', text: value }],
		};

		setMessages((prev) => [...prev, userMessage]);
		setIsLoading(true);

		try {
			// Mock response when no API is configured
			const assistantMessage: UIMessage = {
				id: (Date.now() + 1).toString(),
				role: 'assistant',
				parts: [
					{
						type: 'text',
						text: 'This is a mock response. Configure an API endpoint or handler for real functionality.',
					},
				],
			};

			setTimeout(() => {
				setMessages((prev) => [...prev, assistantMessage]);
				setIsLoading(false);
			}, 1000);
			return;
		} catch (error) {
			console.error('Failed to submit message:', error);
			const errorMessage: UIMessage = {
				id: (Date.now() + 1).toString(),
				role: 'assistant',
				parts: [
					{ type: 'text', text: 'Sorry, I encountered an error processing your message.' },
				],
			};
			setMessages((prev) => [...prev, errorMessage]);
		} finally {
			setIsLoading(false);
		}
	};

	const handleAgentSelect = async (agentId: string) => {
		setSelectedAgent(agentId);
		// No handlers configured for now
	};

	const contextValue: WorkbenchContextType = {
		config,
		agents: agents || {},
		suggestions,
		messages,
		setMessages,
		selectedAgent,
		setSelectedAgent: handleAgentSelect,
		inputMode,
		setInputMode,
		isLoading: isLoading || (shouldUseSchemas && !!schemasLoading),
		submitMessage,
		// Schema data from API
		schemas: schemaData,
		schemasLoading: !!schemasLoading,
		schemasError,
		refetchSchemas,
	};

	return <WorkbenchContext.Provider value={contextValue}>{children}</WorkbenchContext.Provider>;
}
