import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { AppState } from '../../index';
import type { Env } from '../../app';
import {
	DefaultThread,
	generateId,
	type Thread,
	type ThreadIDProvider,
	type ThreadProvider,
} from '../../session';

/**
 * Default thread ID provider that generates or retrieves thread IDs from cookies.
 * @internal
 */
class DefaultThreadIDProvider implements ThreadIDProvider {
	getThreadId(appState: AppState, ctx: Context<Env>): string {
		const existing = getCookie(ctx, 'atid');
		if (existing && existing.startsWith('thrd_')) {
			return existing;
		}
		const threadId = generateId('thrd');
		setCookie(ctx, 'atid', threadId, {
			httpOnly: true,
			sameSite: 'Lax',
			path: '/',
			maxAge: 3600, // 1 hour
		});
		return threadId;
	}
}

/**
 * Local thread provider with no external dependencies.
 * Stores threads in-memory without WebSocket persistence.
 * Suitable for local development and testing.
 */
export class LocalThreadProvider implements ThreadProvider {
	private appState: AppState | null = null;
	private threadIDProvider: ThreadIDProvider = new DefaultThreadIDProvider();

	async initialize(appState: AppState): Promise<void> {
		this.appState = appState;
	}

	setThreadIDProvider(provider: ThreadIDProvider): void {
		this.threadIDProvider = provider;
	}

	async restore(ctx: Context<Env>): Promise<Thread> {
		const threadId = this.threadIDProvider.getThreadId(this.appState!, ctx);

		if (!threadId) {
			throw new Error(`the ThreadIDProvider returned an empty thread id for getThreadId`);
		}
		if (!threadId.startsWith('thrd_')) {
			throw new Error(
				`the ThreadIDProvider returned an invalid thread id (${threadId}) for getThreadId. The thread id must start with the prefix 'thrd_'.`
			);
		}
		if (threadId.length > 64) {
			throw new Error(
				`the ThreadIDProvider returned an invalid thread id (${threadId}) for getThreadId. The thread id must be less than 64 characters long.`
			);
		}
		if (threadId.length < 32) {
			throw new Error(
				`the ThreadIDProvider returned an invalid thread id (${threadId}) for getThreadId. The thread id must be at least 32 characters long.`
			);
		}
		const validThreadIdCharacters = /^[a-zA-Z0-9-]+$/;
		if (!validThreadIdCharacters.test(threadId.substring(5))) {
			throw new Error(
				`the ThreadIDProvider returned an invalid thread id (${threadId}) for getThreadId. The thread id must contain only characters that match the regular expression [a-zA-Z0-9-].`
			);
		}

		// Create in-memory thread (no persistence)
		return new DefaultThread(this, threadId);
	}

	async save(_thread: Thread): Promise<void> {
		// No-op for local provider (in-memory only)
	}

	async destroy(_thread: Thread): Promise<void> {
		// No-op for local provider
	}
}
