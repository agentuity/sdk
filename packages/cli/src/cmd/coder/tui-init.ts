import { hubFetchHeaders } from './hub-url';

export type TuiInitProbeResult =
	| { ok: true }
	| {
			ok: false;
			code: 'unauthorized' | 'http_error' | 'invalid_response' | 'network_error';
			message: string;
	  };

function normalizeErrorMessage(payload: unknown, fallback: string): string {
	if (
		payload &&
		typeof payload === 'object' &&
		typeof (payload as { error?: unknown }).error === 'string'
	) {
		return (payload as { error: string }).error;
	}
	return fallback;
}

export async function probeTuiInitAccess(
	hubHttpUrl: string,
	fetchImpl: typeof fetch = fetch
): Promise<TuiInitProbeResult> {
	try {
		const response = await fetchImpl(`${hubHttpUrl}/api/hub/tui/init`, {
			headers: hubFetchHeaders({ accept: 'application/json' }),
			signal: AbortSignal.timeout(5_000),
		});

		let payload: unknown;
		try {
			payload = await response.json();
		} catch {
			payload = undefined;
		}

		if (response.status === 401 || response.status === 403) {
			return {
				ok: false,
				code: 'unauthorized',
				message: normalizeErrorMessage(payload, `${response.status} ${response.statusText}`),
			};
		}

		if (!response.ok) {
			return {
				ok: false,
				code: 'http_error',
				message: normalizeErrorMessage(payload, `${response.status} ${response.statusText}`),
			};
		}

		if (
			!payload ||
			typeof payload !== 'object' ||
			(payload as { type?: unknown }).type !== 'init'
		) {
			return {
				ok: false,
				code: 'invalid_response',
				message: 'Hub init endpoint did not return an init payload',
			};
		}

		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			code: 'network_error',
			message: error instanceof Error ? error.message : String(error),
		};
	}
}
