/** Verified Genesis upstream identity from an Ion-issued JWT. */
export type GenesisIdentity = {
	userId: string;
	genesisUserId: string;
	orgId: string;
	email?: string;
	projectId: string;
};

/** Hub-published verification material from `/.well-known/sso/identity-signing-key`. */
export type UpstreamIdentitySigningKey = {
	issuer: string;
	algorithm: string;
	key_id: string;
	public_key_pem: string;
	token_header: string;
	token_scope: string;
	token_audience_hint: string;
};

export type GenesisAuthConfig = {
	/** Hosting project id (`aud` claim). Defaults to `process.env.AGENTUITY_CLOUD_PROJECT_ID`. */
	projectId?: string;
	/** Auth hub origin, e.g. `https://auth.agentcompany.com`. */
	authHubUrl?: string;
	/**
	 * When true, missing/invalid tokens yield `null` instead of throwing.
	 * Use for routes that support both public and authenticated access.
	 */
	optional?: boolean;
	/** Override signing-key fetch (tests or custom deployments). */
	fetchSigningKey?: (authHubUrl: string) => Promise<UpstreamIdentitySigningKey>;
};

export type GenesisAuthResult =
	| { ok: true; identity: GenesisIdentity }
	| { ok: false; status: number; message: string };
