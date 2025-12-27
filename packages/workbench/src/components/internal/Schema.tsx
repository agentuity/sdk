import { Braces, X } from "lucide-react";
import { CodeBlock, CodeBlockCopyButton } from "../ai-elements/code-block";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { useWorkbench } from "./WorkbenchProvider";

export interface SchemaProps {
	onOpenChange: (open: boolean) => void;
}

export function Schema({ onOpenChange }: SchemaProps) {
	const { agents, selectedAgent, schemasLoading, schemasError } =
		useWorkbench();

	const selectedAgentData =
		Object.values(agents).find(
			(agent) => agent.metadata.agentId === selectedAgent,
		) || null;

	return (
		<div className="h-full flex flex-col">
			<div className="flex items-center justify-between py-2.5 px-4.5 border-b border-border">
				<div className="flex items-center gap-2">
					<Braces className="size-5 text-muted-foreground" />

					<h2 className="font-medium mt-0.5">Schema</h2>
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

			<ScrollArea className="flex-1 text-sm overflow-hidden">
				<div className="flex flex-col gap-6 p-4">
					{schemasLoading && (
						<div
							className="text-center text-muted-foreground/70 py-8"
							data-loading
						>
							Loading schema
						</div>
					)}

					{schemasError && (
						<div className="flex flex-col gap-1 rounded-md bg-destructive/10 text-destructive py-2.5 px-4">
							<p className="font-medium">Error Loading Schemas</p>
							<p className="text-xs">{schemasError.message}</p>
						</div>
					)}

					{!schemasLoading && !schemasError && !selectedAgentData && (
						<div className="text-center text-muted-foreground/70 py-8">
							<p>No schema available for selected agent</p>
						</div>
					)}

					{!schemasLoading && !schemasError && selectedAgentData && (
						<>
							{selectedAgentData.schema.input?.code ? (
								<div className="flex flex-col gap-2">
									<h3 className="text-sm text-muted-foreground">
										Input Schema
									</h3>

									<CodeBlock
										code={selectedAgentData.schema.input?.code}
										language="typescript"
										className="text-xs! [&_code]:text-xs! [&_pre]:py-3!"
									>
										<CodeBlockCopyButton />
									</CodeBlock>
								</div>
							) : null}

							{selectedAgentData.schema.output?.code ? (
								<div className="flex flex-col gap-2">
									<h3 className="text-sm text-muted-foreground">
										Output Schema
									</h3>

									<CodeBlock
										code={selectedAgentData.schema.output?.code}
										language="typescript"
										className="text-xs! [&_code]:text-xs! [&_pre]:py-3!"
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
