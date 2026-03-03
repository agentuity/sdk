import {
	Background,
	BackgroundVariant,
	Controls,
	type Edge,
	Handle,
	type Node,
	type NodeProps,
	Position,
	ReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { LucideIcon } from 'lucide-react';
import { BookText, Container, Database, DatabaseZap, ListTodo, Radio } from 'lucide-react';
import { useState } from 'react';
import { useTheme } from '../ThemeContext.tsx';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog.tsx';

const iconMap: Record<string, LucideIcon> = {
	database: Database,
	'key-value': DatabaseZap,
	vector: BookText,
	queue: ListTodo,
	sandbox: Container,
	'durable-stream': Radio,
};

function IconNode({ data, id }: NodeProps) {
	const Icon = iconMap[id];
	return (
		<div className="flex items-center justify-center gap-1.5 w-full h-full">
			<Handle type="target" position={Position.Top} className="opacity-0" />
			{Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
			<span className="text-[11px] font-medium">{data.label as string}</span>
			<Handle type="source" position={Position.Bottom} className="opacity-0" />
		</div>
	);
}

const nodeTypes = {
	iconNode: IconNode,
};

const createNodes = (isDark: boolean): Node[] => {
	const layer3Y = 50;
	const layer2Y = 150;
	const layer1Y = 250;

	const colors = {
		active: {
			bg: isDark ? '#001919' : '#e5ffff',
			border: isDark ? '#00ffff' : '#009999',
			text: isDark ? '#00ffff' : '#006666',
		},
		comingSoon: {
			bg: isDark ? '#27272a' : '#f4f4f5',
			border: isDark ? '#52525b' : '#a1a1aa',
			text: isDark ? '#a1a1aa' : '#71717a',
		},
	};

	const nodeStyle = (isActive: boolean) => ({
		borderRadius: 8,
		border: '1px solid',
		backgroundColor: isActive ? colors.active.bg : colors.comingSoon.bg,
		borderColor: isActive ? colors.active.border : colors.comingSoon.border,
		color: isActive ? colors.active.text : colors.comingSoon.text,
	});

	return [
		{
			id: 'auth',
			type: 'iconNode',
			position: { x: 20, y: layer3Y },
			data: { label: 'Auth' },
			style: { ...nodeStyle(true), width: 100, height: 45 },
		},
		{
			id: 'webhooks',
			type: 'iconNode',
			position: { x: 140, y: layer3Y },
			data: { label: 'Webhooks *' },
			style: { ...nodeStyle(false), width: 120, height: 45 },
		},
		{
			id: 'email',
			type: 'iconNode',
			position: { x: 280, y: layer3Y },
			data: { label: 'Email *' },
			style: { ...nodeStyle(false), width: 100, height: 45 },
		},
		{
			id: 'scheduling',
			type: 'iconNode',
			position: { x: 400, y: layer3Y },
			data: { label: 'Scheduling *' },
			style: { ...nodeStyle(false), width: 130, height: 45 },
		},
		{
			id: 'app-analytics',
			type: 'iconNode',
			position: { x: 655, y: layer3Y },
			data: { label: 'Analytics' },
			style: { ...nodeStyle(true), width: 110, height: 45 },
		},
		{
			id: 'database',
			type: 'iconNode',
			position: { x: 20, y: layer2Y },
			data: { label: 'Database' },
			style: { ...nodeStyle(true), width: 110, height: 45 },
		},
		{
			id: 'key-value',
			type: 'iconNode',
			position: { x: 150, y: layer2Y },
			data: { label: 'Key Value' },
			style: { ...nodeStyle(true), width: 110, height: 45 },
		},
		{
			id: 'vector',
			type: 'iconNode',
			position: { x: 280, y: layer2Y },
			data: { label: 'Vector' },
			style: { ...nodeStyle(true), width: 100, height: 45 },
		},
		{
			id: 'queue',
			type: 'iconNode',
			position: { x: 400, y: layer2Y },
			data: { label: 'Queue' },
			style: { ...nodeStyle(true), width: 100, height: 45 },
		},
		{
			id: 'agent-runtime',
			type: 'iconNode',
			position: { x: 520, y: layer2Y },
			data: { label: 'Agent Runtime' },
			style: { ...nodeStyle(true), width: 115, height: 45 },
		},
		{
			id: 'sandbox',
			type: 'iconNode',
			position: { x: 655, y: layer2Y },
			data: { label: 'Sandbox' },
			style: { ...nodeStyle(true), width: 110, height: 45 },
		},
		{
			id: 'durable-stream',
			type: 'iconNode',
			position: { x: 770, y: layer2Y },
			data: { label: 'Stream' },
			style: { ...nodeStyle(true), width: 100, height: 45 },
		},
		{
			id: 'observability',
			type: 'iconNode',
			position: { x: 890, y: layer2Y },
			data: { label: 'Observability' },
			style: { ...nodeStyle(true), width: 130, height: 45 },
		},
		{
			id: 'oltp-database',
			type: 'iconNode',
			position: { x: 20, y: layer1Y },
			data: { label: 'Postgres' },
			style: { ...nodeStyle(true), width: 110, height: 45 },
		},
		{
			id: 'compute',
			type: 'iconNode',
			position: { x: 560, y: layer1Y },
			data: { label: 'Compute' },
			style: { ...nodeStyle(true), width: 110, height: 45 },
		},
		{
			id: 'storage',
			type: 'iconNode',
			position: { x: 770, y: layer1Y },
			data: { label: 'Storage' },
			style: { ...nodeStyle(true), width: 100, height: 45 },
		},
		{
			id: 'olap-warehouse',
			type: 'iconNode',
			position: { x: 890, y: layer1Y },
			data: { label: 'Warehouse *' },
			style: { ...nodeStyle(false), width: 130, height: 45 },
		},
	];
};

const createEdges = (isDark: boolean): Edge[] => {
	const edgeStyle = {
		stroke: isDark ? '#4b5563' : '#d1d5db',
		strokeWidth: 1,
	};

	return [
		{
			id: 'email-webhooks',
			source: 'email',
			target: 'webhooks',
			style: edgeStyle,
		},
		{
			id: 'email-scheduling',
			source: 'email',
			target: 'scheduling',
			style: edgeStyle,
		},
		{
			id: 'webhooks-queue',
			source: 'webhooks',
			target: 'queue',
			style: edgeStyle,
		},
		{
			id: 'scheduling-queue',
			source: 'scheduling',
			target: 'queue',
			style: edgeStyle,
		},
		{
			id: 'app-analytics-olap',
			source: 'app-analytics',
			target: 'olap-warehouse',
			style: edgeStyle,
		},
		{
			id: 'auth-database',
			source: 'auth',
			target: 'database',
			style: edgeStyle,
		},
		{
			id: 'agent-runtime-compute',
			source: 'agent-runtime',
			target: 'compute',
			style: edgeStyle,
		},
		{
			id: 'sandbox-storage',
			source: 'sandbox',
			target: 'storage',
			style: edgeStyle,
		},
		{
			id: 'sandbox-compute',
			source: 'sandbox',
			target: 'compute',
			style: edgeStyle,
		},
		{
			id: 'sandbox-durable-stream',
			source: 'sandbox',
			target: 'durable-stream',
			style: edgeStyle,
		},
		{
			id: 'database-oltp',
			source: 'database',
			target: 'oltp-database',
			style: edgeStyle,
		},
		{
			id: 'queue-oltp',
			source: 'queue',
			target: 'oltp-database',
			style: edgeStyle,
		},
		{
			id: 'key-value-oltp',
			source: 'key-value',
			target: 'oltp-database',
			style: edgeStyle,
		},
		{
			id: 'vector-oltp',
			source: 'vector',
			target: 'oltp-database',
			style: edgeStyle,
		},
		{
			id: 'durable-stream-storage',
			source: 'durable-stream',
			target: 'storage',
			style: edgeStyle,
			type: 'smoothstep',
		},
		{
			id: 'observability-warehouse',
			source: 'observability',
			target: 'olap-warehouse',
			style: edgeStyle,
		},
	];
};

function DiagramFlow({ isDark, onPaneClick }: { isDark: boolean; onPaneClick?: () => void }) {
	const nodes = createNodes(isDark);
	const edges = createEdges(isDark);

	return (
		<ReactFlow
			nodes={nodes}
			edges={edges}
			nodeTypes={nodeTypes}
			fitView
			fitViewOptions={{ padding: 0.2 }}
			nodesDraggable={false}
			nodesConnectable={false}
			elementsSelectable={false}
			panOnDrag={true}
			zoomOnScroll={true}
			zoomOnPinch={true}
			zoomOnDoubleClick={false}
			preventScrolling={false}
			proOptions={{ hideAttribution: true }}
			onPaneClick={onPaneClick}
		>
			<Background
				variant={BackgroundVariant.Dots}
				gap={16}
				size={1}
				color={isDark ? '#374151' : '#e5e7eb'}
			/>
			<Controls showInteractive={false} />
		</ReactFlow>
	);
}

export function GravityNetworkDiagram() {
	const { theme, resolvedTheme } = useTheme();
	const [isFullscreen, setIsFullscreen] = useState(false);

	const isDark = theme === 'dark' || (theme === 'system' && resolvedTheme === 'dark');

	return (
		<>
			<div className="w-full h-[380px] rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden my-6 cursor-pointer [&_.react-flow__handle]:opacity-0">
				<DiagramFlow isDark={isDark} onPaneClick={() => setIsFullscreen(true)} />
				<p className="text-xs text-zinc-500 dark:text-zinc-500 text-center py-2">
					* Coming soon
				</p>
			</div>

			<Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
				<DialogContent className="max-w-[95vw] sm:max-w-[95vw] h-[90vh] p-0 gap-0 [&_.react-flow__handle]:opacity-0">
					<DialogTitle className="sr-only">Gravity Network Diagram</DialogTitle>
					<DiagramFlow isDark={isDark} onPaneClick={() => setIsFullscreen(false)} />
				</DialogContent>
			</Dialog>
		</>
	);
}
