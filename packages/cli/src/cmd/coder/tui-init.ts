export type HubInitProbeResult =
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

export async function probeHubInitAccess(
	hubHttpUrl: string,
	options?: {
		apiKey?: string | null;
		orgId?: string | null;
		fetchImpl?: typeof fetch;
	}
): Promise<HubInitProbeResult> {
	const fetchImpl = options?.fetchImpl ?? fetch;
	const headers: Record<string, string> = {
		accept: 'application/json',
	};
	if (options?.apiKey) {
		if (options.apiKey.startsWith('agc_')) {
			headers['x-agentuity-auth-api-key'] = options.apiKey;
		} else {
			headers.authorization = `Bearer ${options.apiKey}`;
		}
	}
	if (options?.orgId) {
		headers['x-agentuity-orgid'] = options.orgId;
	}

	try {
		const response = await fetchImpl(`${hubHttpUrl}/api/hub/init`, {
			headers,
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
