// Generated workbench entry point
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@agentuity/workbench';
import './styles.css'; // Import CSS for Vite HMR

// Root element
const rootElement = document.getElementById('root');
if (!rootElement) {
	throw new Error('Root element not found');
}

// Render the app
const root = createRoot(rootElement);
root.render(<App configBase64="eyJyb3V0ZSI6Ii93b3JrYmVuY2giLCJoZWFkZXJzIjp7fX0=" />);
