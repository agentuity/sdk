import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../src/components/App';
import './styles.css';
import type { WorkbenchConfig } from '@agentuity/core/workbench';

// Config matching integration-suite
const config: WorkbenchConfig = {
	route: '/workbench',
	headers: {},
	baseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3500',
	apiKey: import.meta.env.VITE_API_KEY,
};
const configBase64 = btoa(JSON.stringify(config));

const root = document.getElementById('root');

if (!root) throw new Error('Root element not found');

createRoot(root).render(<App configBase64={configBase64} />);
