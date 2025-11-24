/**
 * This file is the entry point for the Workbench app, it sets up the root
 * element and renders the Workbench component to the DOM.
 *
 * It is included in `src/app/index.html`.
 */

import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AgentuityContext } from '@agentuity/react';
import { Workbench } from '../components';
import { getWorkbenchConfig } from '@agentuity/core';

// Get workbench config from environment variable (set during build)
const workbenchConfig = getWorkbenchConfig();
const workbenchInstance = { config: workbenchConfig };

// Use the port from config to set the base URL
const baseUrl = `http://localhost:${workbenchConfig.port}`;

const elem = document.getElementById('workbench-root');
if (!elem) {
	console.error('workbench-root element not found');
	throw new Error('Failed to mount workbench: root element not found');
}
const app = (
	<StrictMode>
		<AgentuityContext.Provider value={{ baseUrl }}>
			{baseUrl}
			<Workbench workbench={workbenchInstance} />
		</AgentuityContext.Provider>
	</StrictMode>
);

// Simple rendering without hot module reloading for compatibility
createRoot(elem).render(app);
