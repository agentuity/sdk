/**
 * Deserialize data received from WebSocket or EventStream.
 * Attempts to parse as JSON if the data looks like JSON, otherwise returns as-is.
 */
export const deserializeData = <T>(data: string): T => {
	if (data) {
		try {
			return JSON.parse(data) as T;
		} catch {
			/* */
		}
	}
	return data as T;
};
