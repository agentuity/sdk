import { safeStringify } from '../_util';

export function buildContextString(context?: Record<string, unknown>): string {
	if (context) {
		const contextStr =
			context && Object.keys(context).length > 0
				? Object.entries(context)
						.map(([key, value]) => {
							try {
								return `${key}=${typeof value === 'object' ? safeStringify(value) : value}`;
							} catch {
								return `${key}=[object Object]`;
							}
						})
						.join(' ')
				: '';

		return contextStr;
	}
	return '';
}
