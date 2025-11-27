export { createWorkbench, Workbench } from './workbench';
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

// Export utilities
export { cn } from './lib/utils';

// Re-export workbench config utilities from core
export {
	encodeWorkbenchConfig,
	decodeWorkbenchConfig,
	getWorkbenchConfig,
	type WorkbenchConfig,
} from '@agentuity/core';
