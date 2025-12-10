// Export types
export type { WorkbenchInstance } from './types';

// Export UI components
export { Button } from './components/ui/button';
export {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
	CardFooter,
} from './components/ui/card';
export { Input } from './components/ui/input';

// Export components
export { default as App } from './components/App';
export { MonacoJsonEditor } from './components/internal/MonacoJsonEditor';
export { createWorkbench } from './workbench';

// Export new flexible components
export { Chat } from './components/internal/Chat';
export { Schema } from './components/internal/Schema';
export { Schema as SchemaSidebar } from './components/internal/Schema';
export { useSchemaPanel } from './components/internal/WorkbenchProvider';

// Export backward compatibility wrapper (aliased as Chat for compatibility)
export { ChatWithSchema as ChatCompat } from './components/internal/ChatWithSchema';
