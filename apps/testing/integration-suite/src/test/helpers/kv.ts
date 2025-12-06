/**
 * Helper function to decode KV values that might be Uint8Array or stringified Uint8Array
 */
export function decodeKVValue(value: any): any {
	// Handle Uint8Array directly
	if (value instanceof Uint8Array) {
		const text = new TextDecoder().decode(value);
		return tryParseValue(text);
	}
	
	// Handle stringified Uint8Array (e.g., "114,101,...") - must contain commas
	if (typeof value === 'string' && value.includes(',') && /^\d+(,\d+)+$/.test(value)) {
		const bytes = value.split(',').map((n) => parseInt(n, 10));
		const uint8 = new Uint8Array(bytes);
		const text = new TextDecoder().decode(uint8);
		return tryParseValue(text);
	}
	
	// Handle regular strings (including numeric strings like "123")
	if (typeof value === 'string') {
		return tryParseValue(value);
	}
	
	return value;
}

function tryParseValue(text: string): any {
	// Try to parse as number first (before JSON, since "123" is valid JSON)
	const num = Number(text);
	if (!isNaN(num) && text.trim() !== '') {
		return num;
	}
	
	// Try to parse as JSON for objects/arrays
	try {
		return JSON.parse(text);
	} catch {
		// Return as string
		return text;
	}
}
