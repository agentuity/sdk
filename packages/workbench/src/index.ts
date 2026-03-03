export { default as App } from './components/App.tsx';
export { Chat } from './components/internal/chat.tsx';
export { StatusIndicator } from './components/internal/header.tsx';
export { Schema } from './components/internal/schema.tsx';
export {
	useWorkbench,
	WorkbenchProvider,
	type GetAuthHeaders,
} from './components/internal/workbench-provider.tsx';
export type { WorkbenchInstance } from './types.ts';
export type { ConnectionStatus, WorkbenchMessage } from './types/config.ts';
export { createWorkbench } from './workbench.ts';
