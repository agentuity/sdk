/**
 * Simple formatter for schema code strings.
 * Adds basic indentation and line breaks for readability.
 */
export function formatSchemaCode(code: string): string {
	if (!code) return code;

	let indentLevel = 0;
	const indentSize = 2;
	const lines: string[] = [];
	let currentLine = '';

	for (let i = 0; i < code.length; i++) {
		const char = code[i];
		const nextChar = code[i + 1];
		const prevChar = i > 0 ? code[i - 1] : '';

		// Skip existing whitespace/newlines
		if (char === '\n' || char === '\r' || (char === ' ' && prevChar === ' ')) {
			continue;
		}

		// Handle opening braces
		if (char === '{') {
			currentLine += char;
			lines.push(' '.repeat(indentLevel * indentSize) + currentLine.trim());
			indentLevel++;
			currentLine = '';
			continue;
		}

		// Handle closing braces
		if (char === '}') {
			if (currentLine.trim()) {
				lines.push(' '.repeat(indentLevel * indentSize) + currentLine.trim());
				currentLine = '';
			}
			indentLevel--;
			// Check if next char is closing paren - if so, put on same line
			if (nextChar === ')') {
				currentLine = '}';
			} else {
				lines.push(' '.repeat(indentLevel * indentSize) + char);
			}
			continue;
		}

		// Handle commas - add line break after
		if (char === ',') {
			currentLine += char;
			lines.push(' '.repeat(indentLevel * indentSize) + currentLine.trim());
			currentLine = '';
			continue;
		}

		// Accumulate characters
		currentLine += char;
	}

	// Add any remaining content
	if (currentLine.trim()) {
		lines.push(' '.repeat(indentLevel * indentSize) + currentLine.trim());
	}

	return lines.join('\n');
}
