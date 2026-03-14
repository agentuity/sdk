/**
 * Parse JSON with Comments (JSONC).
 *
 * Strips single-line (`//`) and block (`/* *​/`) comments as well as trailing
 * commas that appear before `}` or `]`, then delegates to the built-in
 * `JSON.parse`.  This covers the comment syntax used by `tsconfig.json` and
 * similar config files without pulling in a full JSON5 parser.
 *
 * String literals are respected — comments and trailing commas inside quoted
 * strings are left untouched.
 */
export function parseJSONC(text: string): unknown {
	let result = '';
	let i = 0;
	const len = text.length;

	while (i < len) {
		const ch = text[i];

		// --- quoted string: copy verbatim, including any escape sequences ---
		if (ch === '"') {
			const start = i;
			i++; // skip opening quote
			while (i < len) {
				if (text[i] === '\\') {
					i += i + 1 < len ? 2 : 1; // skip escaped character (guard end-of-input)
				} else if (text[i] === '"') {
					i++; // skip closing quote
					break;
				} else {
					i++;
				}
			}
			result += text.slice(start, i);
			continue;
		}

		// --- single-line comment: skip to end of line ---
		if (ch === '/' && text[i + 1] === '/') {
			i += 2;
			while (i < len && text[i] !== '\n') {
				i++;
			}
			continue;
		}

		// --- block comment: skip to closing *​/ ---
		if (ch === '/' && text[i + 1] === '*') {
			i += 2;
			while (i < len && !(text[i] === '*' && text[i + 1] === '/')) {
				i++;
			}
			if (i < len) {
				i += 2; // skip closing */
			}
			continue;
		}

		result += ch;
		i++;
	}

	// Strip trailing commas before } or ] (with optional whitespace between).
	result = result.replace(/,(\s*[}\]])/g, '$1');

	return JSON.parse(result);
}
