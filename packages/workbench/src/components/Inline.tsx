import React from 'react';
import { Chat } from './internal/Chat';

export interface InlineProps {
	className?: string;
}

/**
 * Inline component - just the chat area
 * Must be used within WorkbenchProvider
 */
export function Inline({ className }: InlineProps) {
	return <Chat className={className} />;
}

export default Inline;
