/**
 * Global event bus for Vite-native architecture
 * Replaces the App class event system
 */

import type { Agent, AgentContext } from './agent';
import type { Session, Thread } from './session';
import { internal } from './logger/internal';

/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: Generic event system requires 'any' for proper type inference with unknown app states

export type AppEventMap<TAppState = Record<string, never>> = {
	'agent.started': [Agent<any, any, any, any, TAppState>, AgentContext<any, any, TAppState>];
	'agent.completed': [Agent<any, any, any, any, TAppState>, AgentContext<any, any, TAppState>];
	'agent.errored': [
		Agent<any, any, any, any, TAppState>,
		AgentContext<any, any, TAppState>,
		Error,
	];
	'session.started': [Session];
	'session.completed': [Session];
	'thread.created': [Thread];
	'thread.destroyed': [Thread];
};

type AppEventCallback<K extends keyof AppEventMap<any>, TAppState = Record<string, never>> = (
	eventName: K,
	...args: AppEventMap<TAppState>[K]
) => void | Promise<void>;

class GlobalEventBus {
	private eventListeners = new Map<keyof AppEventMap<any>, Set<AppEventCallback<any, any>>>();

	addEventListener<K extends keyof AppEventMap<any>>(
		eventName: K,
		callback: AppEventCallback<K, any>
	): void {
		let callbacks = this.eventListeners.get(eventName);
		if (!callbacks) {
			callbacks = new Set();
			this.eventListeners.set(eventName, callbacks);
		}
		callbacks.add(callback);
	}

	removeEventListener<K extends keyof AppEventMap<any>>(
		eventName: K,
		callback: AppEventCallback<K, any>
	): void {
		const callbacks = this.eventListeners.get(eventName);
		if (!callbacks) return;
		callbacks.delete(callback);
	}

	async fireEvent<K extends keyof AppEventMap<any>>(
		eventName: K,
		...args: AppEventMap<any>[K]
	): Promise<void> {
		const callbacks = this.eventListeners.get(eventName);
		if (!callbacks || callbacks.size === 0) return;

		for (const callback of callbacks) {
			try {
				await callback(eventName, ...args);
			} catch (error) {
				// Log but don't re-throw - event listener errors should not crash the server
				internal.error(`Error in event listener for '${eventName}':`, error);
			}
		}
	}

	clearAllListeners(): void {
		this.eventListeners.clear();
	}
}

// Global singleton instance
const globalEventBus = new GlobalEventBus();

/**
 * Register an event listener for application lifecycle events.
 *
 * Available events:
 * - `agent.started` - Fired when an agent begins execution
 * - `agent.completed` - Fired when an agent completes successfully
 * - `agent.errored` - Fired when an agent throws an error
 * - `session.started` - Fired when a new session starts
 * - `session.completed` - Fired when a session completes
 * - `thread.created` - Fired when a thread is created
 * - `thread.destroyed` - Fired when a thread is destroyed
 *
 * @example
 * ```typescript
 * import { addEventListener } from '@agentuity/runtime';
 *
 * addEventListener('agent.started', (eventName, agent, ctx) => {
 *   console.log(`${agent.metadata.name} started for session ${ctx.sessionId}`);
 * });
 * ```
 */
export function addEventListener<K extends keyof AppEventMap<any>>(
	eventName: K,
	callback: AppEventCallback<K, any>
): void {
	globalEventBus.addEventListener(eventName, callback);
}

/**
 * Remove a previously registered event listener.
 */
export function removeEventListener<K extends keyof AppEventMap<any>>(
	eventName: K,
	callback: AppEventCallback<K, any>
): void {
	globalEventBus.removeEventListener(eventName, callback);
}

/**
 * Fire a global application event.
 *
 * @example
 * ```typescript
 * import { fireEvent } from '@agentuity/runtime';
 *
 * await fireEvent('session.started', session);
 * await fireEvent('agent.completed', agent, ctx);
 * ```
 */
export async function fireEvent<K extends keyof AppEventMap<any>>(
	eventName: K,
	...args: AppEventMap<any>[K]
): Promise<void> {
	await globalEventBus.fireEvent(eventName, ...args);
}

/**
 * Clear all event listeners (useful for testing)
 */
export function clearAllEventListeners(): void {
	globalEventBus.clearAllListeners();
}
