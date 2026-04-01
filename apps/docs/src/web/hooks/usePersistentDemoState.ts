import { useCallback, useState, type SetStateAction } from 'react';

type DemoStorageKind = 'local' | 'session';

interface UsePersistentDemoStateOptions<T> {
	defaultValue: T | (() => T);
	storage?: DemoStorageKind;
	version?: number | string;
	serialize?: (value: T) => string;
	deserialize?: (stored: string) => T;
}

const DEMO_STORAGE_PREFIX = 'agentuity:demo';

function resolveDefaultValue<T>(defaultValue: T | (() => T)): T {
	return typeof defaultValue === 'function' ? (defaultValue as () => T)() : defaultValue;
}

function getWebStorage(storageKind: DemoStorageKind): Storage | null {
	if (typeof window === 'undefined') {
		return null;
	}

	return storageKind === 'local' ? window.localStorage : window.sessionStorage;
}

function readStoredValue<T>(
	storageKind: DemoStorageKind,
	storageKey: string,
	options: UsePersistentDemoStateOptions<T>
): T {
	const fallbackValue = resolveDefaultValue(options.defaultValue);
	const storage = getWebStorage(storageKind);

	if (!storage) {
		return fallbackValue;
	}

	try {
		const storedValue = storage.getItem(storageKey);
		if (storedValue === null) {
			return fallbackValue;
		}

		return options.deserialize
			? options.deserialize(storedValue)
			: (JSON.parse(storedValue) as T);
	} catch {
		return fallbackValue;
	}
}

function writeStoredValue<T>(
	storageKind: DemoStorageKind,
	storageKey: string,
	value: T,
	serialize?: (value: T) => string
) {
	const storage = getWebStorage(storageKind);

	if (!storage) {
		return;
	}

	try {
		storage.setItem(storageKey, serialize ? serialize(value) : JSON.stringify(value));
	} catch {
		// Ignore storage failures so demos still work when storage is unavailable.
	}
}

function clearStoredValue(storageKind: DemoStorageKind, storageKey: string) {
	const storage = getWebStorage(storageKind);

	if (!storage) {
		return;
	}

	try {
		storage.removeItem(storageKey);
	} catch {
		// Ignore storage failures so demos still work when storage is unavailable.
	}
}

export function usePersistentDemoState<T>(
	demoId: string,
	key: string,
	options: UsePersistentDemoStateOptions<T>
) {
	const storageKind = options.storage ?? 'session';
	const version = options.version ?? 1;
	const storageKey = `${DEMO_STORAGE_PREFIX}:${demoId}:${key}:v${version}`;

	const [value, setValueState] = useState<T>(() =>
		readStoredValue(storageKind, storageKey, options)
	);

	const setValue = useCallback(
		(nextValue: SetStateAction<T>) => {
			setValueState((previousValue) => {
				const resolvedValue =
					typeof nextValue === 'function'
						? (nextValue as (value: T) => T)(previousValue)
						: nextValue;

				writeStoredValue(storageKind, storageKey, resolvedValue, options.serialize);
				return resolvedValue;
			});
		},
		[options.serialize, storageKey, storageKind]
	);

	const resetValue = useCallback(() => {
		clearStoredValue(storageKind, storageKey);
		setValueState(resolveDefaultValue(options.defaultValue));
	}, [options.defaultValue, storageKey, storageKind]);

	return [value, setValue, resetValue] as const;
}
