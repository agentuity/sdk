import type { WorkbenchConfig } from '@agentuity/core';
import type { WorkbenchInstance } from './types';

export function createWorkbench(
	config: WorkbenchConfig = { route: '/workbench', headers: {} }
): WorkbenchInstance {
	const finalConfig: WorkbenchConfig = {
		route: config.route,
		headers: config.headers,
	};

	return {
		config: finalConfig,
	};
}

// Export the actual component for use in HTML generation
export { Workbench } from './components';
