import React from 'react';
import { ChatWithSchema } from './internal/ChatWithSchema';

export interface InlineProps {
	className?: string;
}

/**
 * Inline component - just the chat area
 * Must be used within WorkbenchProvider
 */
export function Inline({ className }: InlineProps) {
	return <ChatWithSchema className={className} />;
}

export default Inline;
