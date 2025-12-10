import React from 'react';
import { Chat, ChatProps } from './Chat';
import { Schema } from './Schema';
import { cn } from '../../lib/utils';
import { useWorkbench } from './WorkbenchProvider';

/**
 * Backward compatibility wrapper that includes both Chat and Schema components
 * with the original layout behavior
 */
export function ChatWithSchema({ className }: ChatProps) {
	const { schemaPanel } = useWorkbench();
	
	return (
		<div className="relative flex flex-1 overflow-hidden">
			<div
				className={cn(
					'flex flex-col flex-1 transition-all duration-300 ease-in-out min-w-0',
					schemaPanel.isOpen && 'mr-[600px]',
					className
				)}
			>
				<Chat />
			</div>
			<Schema />
		</div>
	);
}

export default ChatWithSchema;
