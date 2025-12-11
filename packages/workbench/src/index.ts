// Export types
export type { WorkbenchInstance } from './types';

// Export components
export { default as App } from './components/App';
export { Chat } from './components/internal/Chat';
export { Schema } from './components/internal/Schema';
export { WorkbenchProvider, useWorkbench } from './components/internal/WorkbenchProvider';

// Export workbench functions
export { createWorkbench } from './workbench';
