export class GenesisAuthError extends Error {
	readonly status: number;

	constructor(message: string, status = 401) {
		super(message);
		this.name = 'GenesisAuthError';
		this.status = status;
	}
}
