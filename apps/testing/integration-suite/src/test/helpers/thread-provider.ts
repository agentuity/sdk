/**
 * In-Memory Thread Provider for Testing
 *
 * Provides thread persistence for testing without requiring WebSocket connection.
 * Stores thread state in memory across requests.
 */

import type { Thread, ThreadProvider } from '@agentuity/runtime';
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

const THREAD_COOKIE_NAME = 'atid';
const THREAD_EXPIRY = 3600; // 1 hour

class TestThread implements Thread {
	id: string;
	metadata: Record<string, unknown>;
	private _state: Map<string, unknown>;
	private dirty = false;
	private listeners = new Map<'destroyed', Set<Function>>();

	constructor(id: string, initialState?: Record<string, unknown>) {
		this.id = id;
		this.metadata = {};
		this._state = new Map(Object.entries(initialState || {}));
	}

	// Proxy the state Map to automatically mark dirty on modifications
	get state(): Map<string, unknown> {
		const self = this;
		return new Proxy(this._state, {
			get(target, prop) {
				const value = target[prop as keyof Map<string, unknown>];
				if (typeof value === 'function') {
					return function (...args: any[]) {
						// Mark dirty on write operations
						if (prop === 'set' || prop === 'delete' || prop === 'clear') {
							self.dirty = true;
						}
						return (value as Function).apply(target, args);
					};
				}
				return value;
			},
		}) as Map<string, unknown>;
	}

	markDirty() {
		this.dirty = true;
	}

	isDirty(): boolean {
		return this.dirty;
	}

	getSerializedState(): string {
		const obj: Record<string, unknown> = {};
		for (const [key, value] of this.state.entries()) {
			obj[key] = value;
		}
		return JSON.stringify(obj);
	}

	addEventListener(eventName: 'destroyed', callback: Function): void {
		if (!this.listeners.has(eventName)) {
			this.listeners.set(eventName, new Set());
		}
		this.listeners.get(eventName)!.add(callback);
	}

	removeEventListener(eventName: 'destroyed', callback: Function): void {
		this.listeners.get(eventName)?.delete(callback);
	}

	async fireEvent(eventName: 'destroyed'): Promise<void> {
		const callbacks = this.listeners.get(eventName);
		if (callbacks) {
			for (const callback of callbacks) {
				await callback(eventName, this);
			}
		}
	}

	empty(): boolean {
		return this.state.size === 0;
	}

	async destroy(): Promise<void> {
		this.state.clear();
		await this.fireEvent('destroyed');
	}
}

/**
 * In-memory thread storage for testing
 */
export class InMemoryThreadProvider implements ThreadProvider {
	private threads = new Map<string, Record<string, unknown>>();

	async initialize(): Promise<void> {
		// No initialization needed for in-memory storage
	}

	async restore(ctx: Context): Promise<Thread> {
		// Get thread ID from cookie, or generate new one
		let threadId = getCookie(ctx, THREAD_COOKIE_NAME);

		if (!threadId || !threadId.startsWith('thrd_')) {
			// Must match runtime thread id constraints: min 32 chars including prefix,
			// and [a-zA-Z0-9-] after 'thrd_'.
			threadId = `thrd_${crypto.randomUUID().replaceAll('-', '')}`;
		}

		// Set cookie for next request
		setCookie(ctx, THREAD_COOKIE_NAME, threadId, {
			path: '/',
			maxAge: THREAD_EXPIRY,
			httpOnly: false,
			sameSite: 'Lax',
		});

		// Restore thread state from memory
		const storedState = this.threads.get(threadId);
		const thread = new TestThread(threadId, storedState);

		return thread;
	}

	async save(thread: Thread): Promise<void> {
		if (thread instanceof TestThread && thread.isDirty()) {
			// Save thread state to memory
			const serialized = thread.getSerializedState();
			const state = JSON.parse(serialized);
			this.threads.set(thread.id, state);
		}
	}

	async destroy(thread: Thread): Promise<void> {
		this.threads.delete(thread.id);
		if (thread instanceof TestThread) {
			await thread.destroy();
		}
	}

	setThreadIDProvider(): void {
		// Not needed for in-memory provider
	}

	// Test helper: clear all threads
	clearAll(): void {
		this.threads.clear();
	}

	// Test helper: get thread count
	getThreadCount(): number {
		return this.threads.size;
	}
}
