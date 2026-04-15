import * as vscode from 'vscode';

/**
 * Centralized URL configuration for the Agentuity VSCode extension.
 * These can be overridden via VSCode settings for staging/self-hosted environments.
 */

const DEFAULT_APP_URL = 'https://app.agentuity.com';
const DEFAULT_API_URL = 'https://api.agentuity.com';

/**
 * Get the base URL for the Agentuity web app.
 * Used for sessions and other web UI links.
 */
export function getAppUrl(): string {
	const config = vscode.workspace.getConfiguration('agentuity');
	return config.get<string>('appUrl') || DEFAULT_APP_URL;
}

/**
 * Get the base URL for the Agentuity API.
 */
export function getApiUrl(): string {
	const config = vscode.workspace.getConfiguration('agentuity');
	return config.get<string>('apiUrl') || DEFAULT_API_URL;
}

/**
 * Build a sessions URL for a specific project and optional agent filter.
 */
export function getSessionsUrl(projectId: string, agentIdentifier?: string): string {
	const base = getAppUrl();
	let url = `${base}/projects/${projectId}/sessions`;
	if (agentIdentifier) {
		url += `?agent=${encodeURIComponent(agentIdentifier)}`;
	}
	return url;
}

/**
 * Build a deployment URL for a specific project.
 */
export function getDeploymentUrl(projectId: string, deploymentId: string): string {
	const base = getAppUrl();
	return `${base}/projects/${projectId}/deployments/${deploymentId}`;
}
