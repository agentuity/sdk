import React from 'react';
import { X, FileJson } from 'lucide-react';
import { Button } from '../ui/button';
import { CodeBlock, CodeBlockCopyButton } from '../ai-elements/code-block';
import { ScrollArea } from '../ui/scroll-area';
import { useWorkbench } from './WorkbenchProvider';

export interface SchemaProps {
	onOpenChange: (open: boolean) => void;
}

export function Schema({ onOpenChange }: SchemaProps) {
	const { agents, selectedAgent, schemasLoading, schemasError } = useWorkbench();

	const selectedAgentData =
		Object.values(agents).find((agent) => agent.metadata.agentId === selectedAgent) || null;

	return (
		<div className="h-full bg-background border-l border-border flex flex-col">
			{/* Header */}
			<div className="flex items-center justify-between p-4 border-b border-border">
				<div className="flex items-center gap-2">
					<FileJson className="size-5 text-muted-foreground" />
					<div>
						<h2 className="text-lg font-semibold">Schema</h2>
						{selectedAgentData && (
							<p className="text-sm text-muted-foreground">
								{selectedAgentData.metadata.name}
							</p>
						)}
					</div>
				</div>
				<Button
					variant="ghost"
					size="icon"
					onClick={() => onOpenChange(false)}
					className="size-8"
				>
					<X className="size-4" />
				</Button>
			</div>
			{/* Content */}
			<ScrollArea className="flex-1">
				<div className="p-6 space-y-6">
					{schemasLoading && (
						<div className="text-center text-muted-foreground py-8">
							Loading schemas...
						</div>
					)}

					{schemasError && (
						<div className="rounded-md bg-destructive/10 text-destructive p-4">
							<p className="font-medium">Error loading schemas</p>
							<p className="text-sm mt-1">{schemasError.message}</p>
						</div>
					)}

					{!schemasLoading && !schemasError && !selectedAgentData && (
						<div className="text-center text-muted-foreground py-8">
							<p>No schema available for selected agent</p>
						</div>
					)}

					{!schemasLoading && !schemasError && selectedAgentData && (
						<>
							{/* Input Schema */}
							{selectedAgentData.schema.input?.code ? (
								<div className="space-y-2">
									<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
										Input Schema
									</h3>
									<CodeBlock
										code={selectedAgentData.schema.input?.code}
										language="typescript"
									>
										<CodeBlockCopyButton />
									</CodeBlock>
								</div>
							) : null}
							{/* Output Schema */}
							{selectedAgentData.schema.output?.code ? (
								<div className="space-y-2">
									<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
										Output Schema
									</h3>
									<CodeBlock
										code={selectedAgentData.schema.output?.code}
										language="typescript"
									>
										<CodeBlockCopyButton />
									</CodeBlock>
								</div>
							) : null}
						</>
					)}
				</div>
			</ScrollArea>
		</div>
	);
}

export default Schema;
