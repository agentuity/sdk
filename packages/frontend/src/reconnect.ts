export interface ReconnectOptions {
	onReconnect: () => void;
	threshold?: number;
	baseDelay?: number;
	factor?: number;
	maxDelay?: number;
	jitter?: number;
	enabled?: () => boolean;
}

export interface ReconnectManager {
	recordFailure: () => { scheduled: boolean; delay: number | null };
	recordSuccess: () => void;
	cancel: () => void;
	reset: () => void;
	dispose: () => void;
	getAttempts: () => number;
}

export function createReconnectManager(opts: ReconnectOptions): ReconnectManager {
	let attempts = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;

	const cancel = () => {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
	};

	const reset = () => {
		attempts = 0;
		cancel();
	};

	const recordSuccess = () => reset();

	const computeDelay = (attemptAfterThreshold: number) => {
		const base = opts.baseDelay ?? 500;
		const factor = opts.factor ?? 2;
		const max = opts.maxDelay ?? 30000;
		const jitterMax = opts.jitter ?? 250;
		const backoff = Math.min(base * Math.pow(factor, attemptAfterThreshold), max);
		const jitter = jitterMax > 0 ? Math.random() * jitterMax : 0;
		return backoff + jitter;
	};

	const recordFailure = () => {
		attempts += 1;
		const threshold = opts.threshold ?? 0;
		if (opts.enabled && !opts.enabled()) {
			return { scheduled: false, delay: null };
		}

		if (attempts - threshold >= 0) {
			const after = Math.max(0, attempts - threshold);
			const delay = computeDelay(after);
			cancel();
			timer = setTimeout(() => {
				if (opts.enabled && !opts.enabled()) return;
				opts.onReconnect();
			}, delay);
			return { scheduled: true, delay };
		}
		return { scheduled: false, delay: null };
	};

	const dispose = () => cancel();

	const getAttempts = () => attempts;

	return { recordFailure, recordSuccess, cancel, reset, dispose, getAttempts };
}
