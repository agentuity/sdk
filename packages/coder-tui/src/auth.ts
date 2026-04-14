const API_KEY_HEADER = 'x-agentuity-auth-api-key';
const AUTHORIZATION_HEADER = 'Authorization';
const ORG_HEADER = 'x-agentuity-orgid';

function normalizeApiKey(apiKey?: string | null): string | null {
	const trimmed = apiKey?.trim();
	return trimmed ? trimmed : null;
}

function normalizeOrgId(orgId?: string | null): string | null {
	const trimmed = orgId?.trim();
	return trimmed ? trimmed : null;
}

export function isHubApiKey(apiKey?: string | null): boolean {
	const token = normalizeApiKey(apiKey);
	return token?.startsWith('agc_') ?? false;
}

export function applyCoderAuthHeaders(
	headers: Record<string, string>,
	apiKey?: string | null,
	orgId?: string | null
): Record<string, string> {
	const token = normalizeApiKey(apiKey);
	const normalizedOrgId = normalizeOrgId(orgId);
	if (normalizedOrgId) {
		headers[ORG_HEADER] = normalizedOrgId;
	}
	if (!token) return headers;

	if (isHubApiKey(token)) {
		headers[API_KEY_HEADER] = token;
		return headers;
	}

	headers[AUTHORIZATION_HEADER] = `Bearer ${token}`;
	return headers;
}

export function getCoderAuthCurlArgs(apiKey?: string | null, orgId?: string | null): string[] {
	const token = normalizeApiKey(apiKey);
	const args: string[] = [];
	const normalizedOrgId = normalizeOrgId(orgId);
	if (normalizedOrgId) {
		args.push('-H', `${ORG_HEADER}: ${normalizedOrgId}`);
	}
	if (!token) return args;

	if (isHubApiKey(token)) {
		args.push('-H', `${API_KEY_HEADER}: ${token}`);
		return args;
	}

	args.push('-H', `${AUTHORIZATION_HEADER}: Bearer ${token}`);
	return args;
}
