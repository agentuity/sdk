export const getProcessEnv = (key: string): string | undefined => {
	if (typeof process !== 'undefined' && process.env) {
		return process.env[key];
	}
	return undefined;
};
