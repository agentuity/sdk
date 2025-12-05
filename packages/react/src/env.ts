export const getProcessEnv = (key: string): string | undefined => {
	if (typeof process !== 'undefined' && process.env) {
		return process.env[key];
	}
	if (typeof import.meta.env !== 'undefined') {
		return import.meta.env[key];
	}
	return undefined;
};
