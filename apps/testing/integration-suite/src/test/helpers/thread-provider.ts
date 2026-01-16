/**
 * In-Memory Thread Provider for Testing
 *
 * Provides thread persistence for testing without requiring WebSocket connection.
 * Stores thread state in memory across requests.
 */

import type { Thread, ThreadProvider, ThreadState, MergeOperation } from '@agentuity/runtime';
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

const THREAD_COOKIE_NAME = 'atid';
const THREAD_EXPIRY = 3600; // 1 hour

class TestThreadState implements ThreadState {
	#state: Map<string, unknown>;
	#dirty = false;
	#loaded = true; // For testing, we're always "loaded"

	constructor(initialState?: Record<string, unknown>) {
		this.#state = new Map(Object.entries(initialState || {}));
	}

	get loaded(): boolean {
		return this.#loaded;
	}

	get dirty(): boolean {
		return this.#dirty;
	}

	async get<T = unknown>(key: string): Promise<T | undefined> {
		return this.#state.get(key) as T | undefined;
	}

	async set<T = unknown>(key: string, value: T): Promise<void> {
		this.#state.set(key, value);
		this.#dirty = true;
	}

	async has(key: string): Promise<boolean> {
		return this.#state.has(key);
	}

	async delete(key: string): Promise<void> {
		this.#state.delete(key);
		this.#dirty = true;
	}

	async clear(): Promise<void> {
		this.#state.clear();
		this.#dirty = true;
	}

	async entries<T = unknown>(): Promise<[string, T][]> {
		return Array.from(this.#state.entries()) as [string, T][];
	}

	async keys(): Promise<string[]> {
		return Array.from(this.#state.keys());
	}

	async values<T = unknown>(): Promise<T[]> {
		return Array.from(this.#state.values()) as T[];
	}

	async size(): Promise<number> {
		return this.#state.size;
	}

	async push<T = unknown>(key: string, value: T, maxRecords?: number): Promise<void> {
		const existing = this.#state.get(key);
		let arr: unknown[];
		if (Array.isArray(existing)) {
			existing.push(value);
			arr = existing;
		} else if (existing === undefined) {
			arr = [value];
			this.#state.set(key, arr);
		} else {
			throw new Error(`Cannot push to non-array value at key "${key}"`);
		}
		// Apply maxRecords limit
		if (maxRecords !== undefined && arr.length > maxRecords) {
			this.#state.set(key, arr.slice(arr.length - maxRecords));
		}
		this.#dirty = true;
	}

	// Test helpers
	isDirty(): boolean {
		return this.#dirty;
	}

	getSerializedState(): string {
		const obj: Record<string, unknown> = {};
		for (const [key, value] of this.#state.entries()) {
			obj[key] = value;
		}
		return JSON.stringify(obj);
	}
}

class TestThread implements Thread {
	id: string;
	state: TestThreadState;
	private _metadata: Record<string, unknown>;
	private _metadataDirty = false;
	private listeners = new Map<'destroyed', Set<Function>>();

	constructor(id: string, initialState?: Record<string, unknown>) {
		this.id = id;
		this._metadata = {};
		this.state = new TestThreadState(initialState);
	}

	async getMetadata(): Promise<Record<string, unknown>> {
		return { ...this._metadata };
	}

	async setMetadata(metadata: Record<string, unknown>): Promise<void> {
		this._metadata = metadata;
		this._metadataDirty = true;
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

	async empty(): Promise<boolean> {
		const stateSize = await this.state.size();
		return stateSize === 0;
	}

	async destroy(): Promise<void> {
		await this.state.clear();
		await this.fireEvent('destroyed');
	}

	// Test helpers
	isDirty(): boolean {
		return this.state.isDirty() || this._metadataDirty;
	}

	getSerializedState(): string {
		return this.state.getSerializedState();
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
