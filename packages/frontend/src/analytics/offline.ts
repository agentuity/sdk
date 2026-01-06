import type { AnalyticsEvent } from './types';

const DB_NAME = 'agentuity_analytics';
const STORE_NAME = 'events';
const DB_VERSION = 1;
const MAX_QUEUE_SIZE = 1000;

let db: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase | null> | null = null;

/**
 * Initialize IndexedDB for offline event storage
 */
async function initDB(): Promise<IDBDatabase | null> {
	if (typeof indexedDB === 'undefined') {
		return null;
	}

	return new Promise((resolve) => {
		try {
			const request = indexedDB.open(DB_NAME, DB_VERSION);

			request.onerror = () => {
				resolve(null);
			};

			request.onsuccess = () => {
				resolve(request.result);
			};

			request.onupgradeneeded = (e) => {
				const database = (e.target as IDBOpenDBRequest).result;
				if (!database.objectStoreNames.contains(STORE_NAME)) {
					database.createObjectStore(STORE_NAME, { keyPath: 'id' });
				}
			};
		} catch {
			resolve(null);
		}
	});
}

/**
 * Get database instance
 */
async function getDB(): Promise<IDBDatabase | null> {
	if (db) {
		return db;
	}

	if (!dbInitPromise) {
		dbInitPromise = initDB();
	}

	db = await dbInitPromise;
	return db;
}

/**
 * Store event in IndexedDB for offline persistence
 */
export async function storeOfflineEvent(event: AnalyticsEvent): Promise<void> {
	const database = await getDB();
	if (!database) {
		return;
	}

	try {
		const transaction = database.transaction(STORE_NAME, 'readwrite');
		const store = transaction.objectStore(STORE_NAME);

		// Check current count and evict old events if needed before adding
		const count = await new Promise<number>((resolve) => {
			const countRequest = store.count();
			countRequest.onsuccess = () => resolve(countRequest.result);
			countRequest.onerror = () => resolve(0);
		});

		if (count >= MAX_QUEUE_SIZE) {
			// Evict oldest event (FIFO) before adding new one
			await new Promise<void>((resolve) => {
				const cursorRequest = store.openCursor();
				cursorRequest.onsuccess = () => {
					const cursor = cursorRequest.result;
					if (cursor) {
						const deleteRequest = cursor.delete();
						deleteRequest.onsuccess = () => resolve();
						deleteRequest.onerror = () => resolve();
					} else {
						resolve();
					}
				};
				cursorRequest.onerror = () => resolve();
			});
		}

		store.add(event);
	} catch {
		// Silent failure
	}
}

/**
 * Get all offline events and clear them
 */
export async function getAndClearOfflineEvents(): Promise<AnalyticsEvent[]> {
	const database = await getDB();
	if (!database) {
		return [];
	}

	return new Promise((resolve) => {
		try {
			const transaction = database.transaction(STORE_NAME, 'readwrite');
			const store = transaction.objectStore(STORE_NAME);

			const events: AnalyticsEvent[] = [];
			const request = store.openCursor();

			request.onsuccess = () => {
				const cursor = request.result;
				if (cursor) {
					events.push(cursor.value as AnalyticsEvent);
					cursor.delete();
					cursor.continue();
				} else {
					resolve(events);
				}
			};

			request.onerror = () => {
				resolve([]);
			};
		} catch {
			resolve([]);
		}
	});
}

/**
 * Check if we're online
 */
export function isOnline(): boolean {
	if (typeof navigator === 'undefined') {
		return true;
	}
	return navigator.onLine !== false;
}

/**
 * Initialize offline support
 * Listens for online event to flush queued events
 */
export function initOfflineSupport(flushCallback: () => void): void {
	if (typeof window === 'undefined') {
		return;
	}

	window.addEventListener('online', () => {
		// Flush offline events when coming back online
		flushCallback();
	});
}
