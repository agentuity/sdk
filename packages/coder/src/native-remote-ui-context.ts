import type { ExtensionContext } from '@mariozechner/pi-coding-agent';

type ContextWaiter = (ctx: ExtensionContext | null) => void;

let nativeRemoteExtensionContext: ExtensionContext | null = null;
const waiters = new Set<ContextWaiter>();

export function setNativeRemoteExtensionContext(ctx: ExtensionContext | null): void {
	nativeRemoteExtensionContext = ctx;
	for (const waiter of waiters) {
		waiter(ctx);
	}
	waiters.clear();
}

export function getNativeRemoteExtensionContext(): ExtensionContext | null {
	return nativeRemoteExtensionContext;
}

export function waitForNativeRemoteExtensionContext(
	timeoutMs = 10_000
): Promise<ExtensionContext | null> {
	if (nativeRemoteExtensionContext) {
		return Promise.resolve(nativeRemoteExtensionContext);
	}

	return new Promise((resolve) => {
		const waiter: ContextWaiter = (ctx) => {
			clearTimeout(timer);
			waiters.delete(waiter);
			resolve(ctx);
		};

		const timer = setTimeout(() => {
			waiters.delete(waiter);
			resolve(nativeRemoteExtensionContext);
		}, timeoutMs);

		waiters.add(waiter);
	});
}
