// Export types
export type { WorkbenchInstance } from './types';

// helper to create a new workbench instance
export { createWorkbench } from './workbench';

// this is used by the sdk to render the /workbench
export { default as App } from './components/App';

// components build workbench app/web
export { Chat } from './components/internal/Chat';
export { Schema } from './components/internal/Schema';
export { Schema as SchemaSidebar } from './components/internal/Schema';
export {
	useSchemaPanel,
	useWorkbench,
	WorkbenchProvider,
} from './components/internal/WorkbenchProvider';
export { useSidebarIntegration } from './hooks/useSidebarIntegration';
