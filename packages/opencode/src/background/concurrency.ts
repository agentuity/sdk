import { StructuredError } from '@agentuity/core';

/**
 * Error thrown when a concurrency waiter is cancelled.
 */
export const ConcurrencyCancelledError = StructuredError(
	'ConcurrencyCancelledError',
	'Concurrency waiter cancelled'
)<{ key?: string }>();

type Waiter = {
	resolve: () => void;
	reject: (error: Error) => void;
};

export interface ConcurrencyConfig {
	defaultLimit: number;
	limits?: Record<string, number>;
}

export class ConcurrencyManager {
	private defaultLimit: number;
	private limits = new Map<string, number>();
	private counts = new Map<string, number>();
	private queues = new Map<string, Waiter[]>();

	constructor(config?: Partial<ConcurrencyConfig>) {
		// Clamp defaultLimit to at least 1 to prevent deadlocks
		this.defaultLimit = Math.max(1, config?.defaultLimit ?? 1);
		if (config?.limits) {
			for (const [key, value] of Object.entries(config.limits)) {
				// Clamp each limit to at least 1
				this.limits.set(key, Math.max(1, value));
			}
		}
	}

	getConcurrencyLimit(key: string): number {
		return this.limits.get(key) ?? this.defaultLimit;
	}

	async acquire(key: string): Promise<void> {
		const limit = this.getConcurrencyLimit(key);
		const count = this.getCount(key);

		if (count < limit) {
			this.counts.set(key, count + 1);
			return;
		}

		await new Promise<void>((resolve, reject) => {
			const queue = this.getQueue(key);
			queue.push({
				resolve: () => {
					this.counts.set(key, this.getCount(key) + 1);
					resolve();
				},
				reject,
			});
		});
	}

	release(key: string): void {
		const count = this.getCount(key);
		if (count > 0) {
			this.counts.set(key, count - 1);
		}
		this.flushQueue(key);
	}

	cancelWaiters(key: string): void {
		const queue = this.queues.get(key);
		if (!queue || queue.length === 0) return;

		for (const waiter of queue) {
			waiter.reject(new ConcurrencyCancelledError({ key }));
		}
		this.queues.delete(key);
	}

	clear(): void {
		for (const key of this.queues.keys()) {
			this.cancelWaiters(key);
		}
		this.counts.clear();
		this.queues.clear();
	}

	getCount(key: string): number {
		return this.counts.get(key) ?? 0;
	}

	getQueueLength(key: string): number {
		return this.queues.get(key)?.length ?? 0;
	}

	private getQueue(key: string): Waiter[] {
		const existing = this.queues.get(key);
		if (existing) return existing;
		const queue: Waiter[] = [];
		this.queues.set(key, queue);
		return queue;
	}

	private flushQueue(key: string): void {
		const queue = this.queues.get(key);
		if (!queue || queue.length === 0) return;

		const limit = this.getConcurrencyLimit(key);
		while (queue.length > 0 && this.getCount(key) < limit) {
			const waiter = queue.shift();
			if (!waiter) break;
			waiter.resolve();
		}
	}
}
