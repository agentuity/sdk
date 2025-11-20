export function isPossiblyJSON(val: unknown) {
	if (val) {
		if (typeof val === 'object') {
			return true;
		}
		if (typeof val === 'string') {
			const v = (val as string).trim();
			if (v.startsWith('{') && v.endsWith('}')) {
				return true;
			}
			if (v.startsWith('[') && v.endsWith(']')) {
				return true;
			}
		}
	}
	return false;
}

export function tryParseJSON(val: string) {
	if (isPossiblyJSON(val)) {
		try {
			return JSON.parse(val as string);
		} catch {
			/* */
		}
	}
	return val;
}
