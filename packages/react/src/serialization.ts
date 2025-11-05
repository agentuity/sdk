/**
 * Deserialize data received from WebSocket or EventStream.
 * Attempts to parse as JSON if the data looks like JSON, otherwise returns as-is.
 */
export const deserializeData = <T>(data: string): T => {
	if (data) {
		if (data.startsWith('{') || data.startsWith('[')) {
			try {
				return JSON.parse(data) as T;
			} catch (ex) {
				console.error('error parsing data as JSON', ex, data);
			}
		}
	}
	return data as T;
};
