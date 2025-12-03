/**
 * Utility to send notifications directly to workbench clients via WebSocket
 */

export interface WorkbenchNotifyOptions {
	port?: number;
	message: 'restarting' | 'alive';
}

/**
 * Send a notification directly to workbench clients via WebSocket
 *
 * @param options - Configuration for the notification
 * @returns Promise that resolves when notification is sent
 *
 * @example
 * ```typescript
 * // Notify clients that server is restarting
 * await notifyWorkbenchClients({
 *   baseUrl: 'ws://localhost:3500',
 *   message: 'restarting'
 * });
 *
 * // Notify clients that server is alive
 * await notifyWorkbenchClients({
 *   message: 'alive'
 * });
 * ```
 */
export async function notifyWorkbenchClients(options: WorkbenchNotifyOptions): Promise<void> {
	const { port = 3500, message } = options;

	const wsUrl = new URL(`ws://localhost:${port}`);

	return new Promise((resolve) => {
		try {
			wsUrl.pathname = '/_agentuity/workbench/ws';

			const ws = new WebSocket(wsUrl.toString());

			// Set a timeout to avoid hanging
			const timeout = setTimeout(() => {
				ws.close();
				resolve();
			}, 2000);

			ws.onopen = () => {
				ws.send(message);
				ws.close();
			};

			ws.onclose = () => {
				clearTimeout(timeout);
				resolve();
			};

			ws.onerror = () => {
				clearTimeout(timeout);
				ws.close();
				resolve();
			};
		} catch (_error) {
			// Silently fail - this ensures the CLI doesn't fail if the app server isn't running
			resolve();
		}
	});
}
