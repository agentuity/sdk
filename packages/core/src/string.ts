/**
 * String utility functions for identifier conversion
 */

/**
 * Convert a string to camelCase
 * @param str - The string to convert (can contain dashes, underscores, or spaces)
 * @returns The camelCase version of the string (always a valid JS/TS identifier)
 * @example
 * toCamelCase('my-agent') // 'myAgent'
 * toCamelCase('my_agent') // 'myAgent'
 * toCamelCase('my agent') // 'myAgent'
 * toCamelCase('my--multiple--dashes') // 'myMultipleDashes'
 * toCamelCase('123-agent') // '_123Agent' (prefixed to make valid identifier)
 * toCamelCase('123') // '_123' (prefixed to make valid identifier)
 */
export function toCamelCase(str: string): string {
	const result = str
		.replace(/[-_\s]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ''))
		.replace(/^(.)/, (char) => char.toLowerCase());

	// Prefix with underscore if result starts with a digit (invalid JS/TS identifier)
	return /^\d/.test(result) ? `_${result}` : result;
}

/**
 * Convert a string to PascalCase
 * @param str - The string to convert (can contain dashes, underscores, or spaces)
 * @returns The PascalCase version of the string
 * @example
 * toPascalCase('my-agent') // 'MyAgent'
 * toPascalCase('my_agent') // 'MyAgent'
 * toPascalCase('my agent') // 'MyAgent'
 */
export function toPascalCase(str: string): string {
	const camel = toCamelCase(str);
	return camel.charAt(0).toUpperCase() + camel.slice(1);
}
