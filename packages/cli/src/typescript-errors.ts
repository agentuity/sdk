/**
 * Rust-style TypeScript error formatting
 *
 * Formats TypeScript compiler errors in a style similar to Rust's compiler output,
 * with source code context, error highlighting, and helpful formatting.
 */

import { join } from 'node:path';
import type { GrammarItem } from './tsc-output-parser';
import {
	colorError,
	colorPrimary,
	colorInfo,
	colorMuted,
	bold,
	link,
	getDisplayWidth,
	getColor,
	plural,
	sourceLink,
	truncateToWidth,
} from './tui';
import { symbols } from './tui/symbols';

interface TypeScriptError {
	path: string;
	line: number;
	col: number;
	errorCode: string;
	message: string;
}

interface ErrorCodeLine {
	content: string;
	rawWidth: number;
}

interface PreparedError {
	error: TypeScriptError;
	header: string;
	location: string;
	codeLines: ErrorCodeLine[];
	maxContentWidth: number;
}

/**
 * Check if a GrammarItem is a TypeScript error (not a warning or other diagnostic)
 */
function isTsErrorItem(item: GrammarItem): boolean {
	return item.type === 'Item' && item.value?.tsError?.value?.type === 'error';
}

/**
 * Parse GrammarItem array into structured TypeScript errors
 */
function parseErrors(items: GrammarItem[]): TypeScriptError[] {
	const errors: TypeScriptError[] = [];

	for (const item of items) {
		if (!isTsErrorItem(item) || !item.value) continue;

		const val = item.value;
		errors.push({
			path: val.path?.value ?? 'unknown',
			line: val.cursor?.value?.line ?? 0,
			col: val.cursor?.value?.col ?? 0,
			errorCode: val.tsError?.value?.errorString ?? 'TS0000',
			message: (val.message?.value ?? '').trim(),
		});
	}

	return errors;
}

interface SourceContext {
	before: string | null;
	beforeLineNum: number;
	current: string;
	after: string | null;
	afterLineNum: number;
	total: number;
}

/**
 * Read source lines with context (line before, current, line after)
 */
async function getSourceContext(
	filePath: string,
	lineNumber: number
): Promise<SourceContext | null> {
	try {
		const file = Bun.file(filePath);
		if (!(await file.exists())) {
			return null;
		}
		const content = await file.text();
		const lines = content.split('\n');
		if (lineNumber <= 0 || lineNumber > lines.length) {
			return null;
		}

		const current = lines[lineNumber - 1];
		const before = lineNumber > 1 ? lines[lineNumber - 2] : null;
		const after = lineNumber < lines.length ? lines[lineNumber] : null;

		return {
			before: before !== null && before.trim() !== '' ? before : null,
			beforeLineNum: lineNumber - 1,
			current,
			after: after !== null && after.trim() !== '' ? after : null,
			afterLineNum: lineNumber + 1,
			total: lines.length,
		};
	} catch {
		return null;
	}
}

/**
 * Prepare error data without rendering (first pass)
 */
async function prepareError(
	error: TypeScriptError,
	projectDir: string,
	maxAvailableWidth: number
): Promise<PreparedError> {
	const fullPath = error.path.startsWith('/') ? error.path : `${projectDir}/${error.path}`;

	// Error header
	const url = link(
		`https://typescript.tv/errors/#${error.errorCode}`,
		`error[${error.errorCode}]`,
		getColor('error')
	);
	const header = '  ' + url + colorMuted(': ') + bold(error.message);

	// File location
	const vscodelink = sourceLink(
		join(projectDir, error.path),
		error.line,
		error.col,
		`${error.path}:${error.line}:${error.col}`,
		getColor('info')
	);
	const location = colorInfo(`  ${vscodelink}`);

	const codeLines: ErrorCodeLine[] = [];

	// Get source code context
	const context = await getSourceContext(fullPath, error.line);

	if (context !== null) {
		const maxLineNum = Math.max(
			context.before !== null ? context.beforeLineNum : error.line,
			error.line,
			context.after !== null ? context.afterLineNum : error.line
		);
		const lineNumWidth = String(maxLineNum).length;
		const formatLineNum = (num: number) => String(num).padStart(lineNumWidth);
		const padding = ' '.repeat(lineNumWidth);
		const linePrefix = lineNumWidth + 3;

		const truncateCodeLine = (lineNum: string, separator: string, code: string): string => {
			const prefixWidth = getDisplayWidth(lineNum) + getDisplayWidth(separator) + 1;
			const availableForCode = maxAvailableWidth - prefixWidth;
			if (availableForCode > 10 && getDisplayWidth(code) > availableForCode) {
				return `${lineNum}${separator} ${truncateToWidth(code, availableForCode, '…')}`;
			}
			return `${lineNum}${separator} ${code}`;
		};

		if (context.beforeLineNum > 1) {
			const dots = '.'.repeat(String(context.beforeLineNum).length);
			const content = colorMuted(`${dots} ${symbols.bar}`);
			codeLines.push({ content, rawWidth: getDisplayWidth(content) });
		}

		// Context line before (muted)
		if (context.before !== null) {
			const lineContent = truncateCodeLine(
				formatLineNum(context.beforeLineNum),
				` ${symbols.bar}`,
				context.before
			);
			const content = colorMuted(lineContent);
			codeLines.push({ content, rawWidth: getDisplayWidth(content) });
		}

		// Error line (primary color)
		const truncatedCurrent =
			getDisplayWidth(context.current) > maxAvailableWidth - linePrefix
				? truncateToWidth(context.current, maxAvailableWidth - linePrefix, '…')
				: context.current;
		const errorLineContent = `${colorInfo(formatLineNum(error.line))} ${colorMuted(symbols.bar)} ${colorPrimary(truncatedCurrent)}`;
		codeLines.push({ content: errorLineContent, rawWidth: getDisplayWidth(errorLineContent) });

		// Error pointer line with carets
		const col = Math.max(0, error.col - 1);
		let underlineLength = 1;
		const restOfLine = context.current.slice(col);
		const identifierMatch = restOfLine.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
		if (identifierMatch) {
			underlineLength = identifierMatch[0].length;
		} else {
			const tokenMatch = restOfLine.match(/^\S+/);
			if (tokenMatch) {
				underlineLength = Math.min(tokenMatch[0].length, 20);
			}
		}

		const maxCaretWidth = maxAvailableWidth - linePrefix;
		const caretStart = Math.min(col, maxCaretWidth - 1);
		const caretLen = Math.min(underlineLength, maxCaretWidth - caretStart);
		const carets = caretLen > 0 ? '^'.repeat(caretLen) : '^';
		const caretPadding = ' '.repeat(caretStart);
		const caretLine = `${padding} ${colorMuted(symbols.bar)} ${caretPadding}${colorError(carets)}`;
		codeLines.push({ content: caretLine, rawWidth: getDisplayWidth(caretLine) });

		// Context line after (muted)
		if (context.after !== null) {
			const lineContent = truncateCodeLine(
				formatLineNum(context.afterLineNum),
				` ${symbols.bar}`,
				context.after
			);
			const content = colorMuted(lineContent);
			codeLines.push({ content, rawWidth: getDisplayWidth(content) });
		}
		if (context.afterLineNum + 1 < context.total) {
			const dots = '.'.repeat(String(context.afterLineNum).length);
			const content = colorMuted(`${dots} ${symbols.bar}`);
			codeLines.push({ content, rawWidth: getDisplayWidth(content) });
		}
	}

	const maxContentWidth = codeLines.length > 0 ? Math.max(...codeLines.map((l) => l.rawWidth)) : 0;

	return {
		error,
		header,
		location,
		codeLines,
		maxContentWidth,
	};
}

/**
 * Render a prepared error with a specific box width
 */
function renderError(prepared: PreparedError, boxContentWidth: number): string {
	const lines: string[] = [];

	lines.push(prepared.header);
	lines.push(prepared.location);

	if (prepared.codeLines.length > 0) {
		const boxWidth = boxContentWidth + 2;

		// Draw box
		lines.push(
			colorMuted(`  ${symbols.cornerTL}${symbols.barH.repeat(boxWidth)}${symbols.cornerTR}`)
		);
		for (const codeLine of prepared.codeLines) {
			const rightPad = ' '.repeat(Math.max(0, boxContentWidth - codeLine.rawWidth));
			lines.push(
				colorMuted(`  ${symbols.bar}`) +
					` ${codeLine.content}${rightPad} ` +
					colorMuted(symbols.bar)
			);
		}
		lines.push(
			colorMuted(`  ${symbols.cornerBL}${symbols.barH.repeat(boxWidth)}${symbols.cornerBR}`)
		);
	} else {
		lines.push(colorMuted('  (source not available)'));
	}

	return lines.join('\n') + '\n';
}

/**
 * Group errors by file for better organization
 */
function groupErrorsByFile(errors: TypeScriptError[]): Map<string, TypeScriptError[]> {
	const grouped = new Map<string, TypeScriptError[]>();

	for (const error of errors) {
		const existing = grouped.get(error.path) ?? [];
		existing.push(error);
		grouped.set(error.path, existing);
	}

	for (const errors of grouped.values()) {
		errors.sort((a, b) => a.line - b.line || a.col - b.col);
	}

	return grouped;
}

export interface FormatOptions {
	/** Project directory for resolving relative paths */
	projectDir: string;
	/** Maximum number of errors to display (default: all) */
	maxErrors?: number;
}

/**
 * Format TypeScript errors in Rust-style output
 */
export async function formatTypeScriptErrors(
	items: GrammarItem[],
	options: FormatOptions
): Promise<string> {
	const errors = parseErrors(items);

	if (errors.length === 0) {
		return '';
	}

	// Calculate terminal constraints
	const terminalWidth = process.stdout.columns || 80;
	const boxChrome = 6;
	const maxAvailableWidth = terminalWidth - boxChrome;

	// First pass: prepare all errors and collect their widths
	const groupedErrors = groupErrorsByFile(errors);
	const maxErrors = options.maxErrors ?? errors.length;
	const preparedErrors: PreparedError[] = [];

	let displayedCount = 0;
	for (const [, fileErrors] of groupedErrors) {
		for (const error of fileErrors) {
			if (displayedCount >= maxErrors) break;

			const prepared = await prepareError(error, options.projectDir, maxAvailableWidth);
			preparedErrors.push(prepared);
			displayedCount++;
		}
		if (displayedCount >= maxErrors) break;
	}

	// Calculate uniform box width (max content width across all errors, capped at terminal width)
	const globalMaxContentWidth = Math.max(...preparedErrors.map((p) => p.maxContentWidth));
	const uniformBoxContentWidth = Math.min(globalMaxContentWidth, maxAvailableWidth);

	// Second pass: render all errors with uniform width
	const output: string[] = [];
	for (const prepared of preparedErrors) {
		output.push(renderError(prepared, uniformBoxContentWidth));
	}

	// Summary line
	const totalErrors = errors.length;
	const hiddenCount = totalErrors - displayedCount;

	let msg = bold(
		colorPrimary(
			`aborting due to ${totalErrors} TypeScript compiler ${plural(totalErrors, 'error', 'errors')}`
		)
	);

	if (hiddenCount > 0) {
		msg += colorMuted(` (${hiddenCount} not shown)`);
	}
	output.push(`${bold(colorError('error'))}: ${msg}`);

	return output.join('\n');
}

/**
 * Check if the parsed result contains any errors
 */
export function hasErrors(items: GrammarItem[]): boolean {
	return items.some(isTsErrorItem);
}

/**
 * Get the count of errors
 */
export function getErrorCount(items: GrammarItem[]): number {
	return items.filter(isTsErrorItem).length;
}
