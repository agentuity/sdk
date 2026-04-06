/**
 * Box and note rendering utilities for TUI
 */
import { symbols } from './symbols';
import { colors } from './colors';
import { getTerminalWidth } from '../tui';

/**
 * Get string width (accounting for ANSI codes and OSC 8 hyperlinks)
 */
function stringWidth(str: string): number {
	// Remove ANSI escape codes (colors, etc.)
	// eslint-disable-next-line no-control-regex
	let cleaned = str.replace(/\x1b\[[0-9;]*m/g, '');
	// Remove OSC 8 hyperlink sequences
	// eslint-disable-next-line no-control-regex
	cleaned = cleaned.replace(/\u001b\]8;;[^\u0007]*\u0007/g, '');
	// Use Bun.stringWidth for proper Unicode width calculation
	return Bun.stringWidth(cleaned);
}

/**
 * Wrap text to fit within width
 */
function wrapText(text: string, width: number): string[] {
	const words = text.split(' ');
	const lines: string[] = [];
	let currentLine = '';

	for (const word of words) {
		// Handle words longer than width
		if (stringWidth(word) > width) {
			if (currentLine) lines.push(currentLine);
			// Truncate long words with ellipsis if width allows, otherwise just slice
			if (width >= 4) {
				lines.push(word.slice(0, width - 3) + '...');
			} else {
				lines.push(word.slice(0, Math.max(0, width)));
			}
			currentLine = '';
			continue;
		}

		const testLine = currentLine ? `${currentLine} ${word}` : word;
		if (stringWidth(testLine) <= width) {
			currentLine = testLine;
		} else {
			if (currentLine) lines.push(currentLine);
			currentLine = word;
		}
	}
	if (currentLine) lines.push(currentLine);

	return lines;
}

interface BoxOptions {
	title?: string;
	content: string;
	titleAlign?: 'left' | 'center' | 'right';
	contentAlign?: 'left' | 'center' | 'right';
	width?: number;
	padding?: number;
	withGuide?: boolean;
}

/**
 * Draw a boxed message (like clack's note)
 */
export function drawBox(options: BoxOptions): string {
	const {
		title = '',
		content,
		titleAlign = 'left',
		contentAlign = 'left',
		withGuide = true,
	} = options;

	const termWidth = getTerminalWidth();

	// Calculate box width (no guide prefix inside the box)
	const maxWidth = termWidth - 3; // Account for guide prefix space
	const boxWidth = options.width || Math.min(60, maxWidth);
	// Ensure we never end up with negative inner/content widths
	const innerWidth = Math.max(boxWidth - 2, 1); // Subtract left/right borders safely

	// Clamp padding to non-negative
	const padding = Math.max(0, options.padding ?? 2);

	// Prepare title line
	// Title format: ◇  [title] ───────╮
	// The title line should match the width of content lines: │[innerWidth]│
	let titleLine = '';

	if (title) {
		const symbol = `${colors.success(symbols.completed)}`;
		const titleText = colors.reset(title);
		const titleTextWidth = stringWidth(symbols.completed) + stringWidth(title);
		const barsNeeded = Math.max(innerWidth - titleTextWidth - 3, 1); // -3 for symbol, 2 spaces, and 1 space before bars

		// Apply title alignment
		if (titleAlign === 'center') {
			const leftBars = Math.floor(barsNeeded / 2);
			const rightBars = barsNeeded - leftBars;
			titleLine = `${colors.secondary(symbols.barH.repeat(leftBars))} ${symbol}  ${titleText} ${colors.secondary(symbols.barH.repeat(rightBars) + symbols.cornerTR)}`;
		} else if (titleAlign === 'right') {
			titleLine = `${colors.secondary(symbols.barH.repeat(barsNeeded))} ${symbol}  ${titleText} ${colors.secondary(symbols.cornerTR)}`;
		} else {
			// left (default)
			titleLine = `${symbol}  ${titleText} ${colors.secondary(symbols.barH.repeat(barsNeeded) + symbols.cornerTR)}`;
		}
	}

	// Prepare content lines
	const contentLines = content.split('\n');
	const wrappedLines: string[] = [];

	// Ensure content width is non-negative
	const wrapWidth = Math.max(innerWidth - padding * 2, 0);

	for (const line of contentLines) {
		if (stringWidth(line) > wrapWidth) {
			wrappedLines.push(...wrapText(line, wrapWidth));
		} else {
			wrappedLines.push(line);
		}
	}

	// Build box (without guide prefix on each line)
	const boxLines: string[] = [];

	// Title line
	if (title) {
		boxLines.push(titleLine);
	}

	// Content lines with borders
	// The title line is innerWidth + 1 wide, so content should be innerWidth - 1 between bars
	const contentWidth = Math.max(innerWidth - 1, 0);
	const emptyLine = `${colors.secondary(symbols.bar)}${' '.repeat(contentWidth)}${colors.secondary(symbols.bar)}`;
	boxLines.push(emptyLine);

	for (const line of wrappedLines) {
		const lineLen = stringWidth(line);
		let leftPad =
			contentAlign === 'right'
				? contentWidth - lineLen - padding
				: contentAlign === 'center'
					? Math.floor((contentWidth - lineLen) / 2)
					: padding;

		// Clamp to non-negative
		leftPad = Math.max(leftPad, 0);
		const rightPad = Math.max(contentWidth - lineLen - leftPad, 0);

		boxLines.push(
			`${colors.secondary(symbols.bar)}${' '.repeat(leftPad)}${line}${' '.repeat(rightPad)}${colors.secondary(symbols.bar)}`
		);
	}

	boxLines.push(emptyLine);

	// Now add guide bar before/after if needed
	const lines: string[] = [];

	if (withGuide) {
		lines.push(colors.secondary(symbols.bar));
	}

	// Add all box lines (no prefix - flush left)
	lines.push(...boxLines);

	// Bottom border - should match content line width (│ + contentWidth + │)
	// contentWidth = innerWidth - 1, so total is innerWidth + 1
	// Bottom border: ├ + (innerWidth - 1) bars + ╯ = innerWidth + 1
	if (withGuide) {
		lines.push(
			colors.secondary(symbols.connect + symbols.barH.repeat(innerWidth - 1) + symbols.cornerBR)
		);
	} else {
		lines.push(
			colors.secondary(symbols.cornerBL + symbols.barH.repeat(innerWidth - 1) + symbols.cornerBR)
		);
	}

	return lines.join('\n');
}

/**
 * Render a note box (matches clack style)
 */
export function note(message: string, title = ''): void {
	const output = drawBox({
		title,
		content: message,
		contentAlign: 'left',
		withGuide: true,
	});
	console.log(output);
}

/**
 * Draw an error box with red border
 * @param withGuide - If true (default), shows guide bar at top and connector at bottom for use in flows.
 *                    If false, renders as a standalone box with proper corners.
 */
export function errorBox(title: string, message: string, withGuide = true): void {
	const termWidth = getTerminalWidth();
	const maxWidth = termWidth - 3;
	const boxWidth = Math.min(60, maxWidth);
	const innerWidth = Math.max(boxWidth - 2, 1);
	const contentWidth = Math.max(innerWidth - 1, 0);
	const padding = 2;

	const lines: string[] = [];

	// Top border with title
	const errorSymbol = colors.error(symbols.error);
	const titleText = colors.error(title);
	const titleTextWidth = 1 + stringWidth(title); // symbol + title
	const barsNeeded = Math.max(innerWidth - titleTextWidth - 3, 1);

	if (withGuide) {
		// Guide style: bar at top, then title line without top-left corner
		lines.push(colors.error(symbols.bar));
		const titleLine = `${errorSymbol}  ${titleText} ${colors.error(symbols.barH.repeat(barsNeeded) + symbols.cornerTR)}`;
		lines.push(titleLine);
	} else {
		// Standalone style: title line with top-left corner
		const titleLine = `${colors.error(symbols.cornerTL)}${errorSymbol} ${titleText} ${colors.error(symbols.barH.repeat(barsNeeded) + symbols.cornerTR)}`;
		lines.push(titleLine);
	}

	// Empty line
	const emptyLine = `${colors.error(symbols.bar)}${' '.repeat(contentWidth)}${colors.error(symbols.bar)}`;
	lines.push(emptyLine);

	// Wrap and render content lines
	const wrapWidth = Math.max(contentWidth - padding * 2, 0);
	const contentLines = message.split('\n');
	for (const line of contentLines) {
		const wrapped = stringWidth(line) > wrapWidth ? wrapText(line, wrapWidth) : [line];
		for (const wl of wrapped) {
			const lineLen = stringWidth(wl);
			const leftPad = padding;
			const rightPad = Math.max(contentWidth - lineLen - leftPad, 0);
			lines.push(
				`${colors.error(symbols.bar)}${' '.repeat(leftPad)}${wl}${' '.repeat(rightPad)}${colors.error(symbols.bar)}`
			);
		}
	}

	lines.push(emptyLine);

	// Bottom border
	if (withGuide) {
		lines.push(
			colors.error(symbols.connect + symbols.barH.repeat(innerWidth - 1) + symbols.cornerBR)
		);
	} else {
		lines.push(
			colors.error(symbols.cornerBL + symbols.barH.repeat(innerWidth - 1) + symbols.cornerBR)
		);
	}

	console.log(lines.join('\n'));
}

/**
 * Draw a warning box with yellow border
 */
export function warningBox(title: string, message: string): void {
	const termWidth = getTerminalWidth();
	const maxWidth = termWidth - 3;
	const boxWidth = Math.min(60, maxWidth);
	const innerWidth = Math.max(boxWidth - 2, 1);
	const contentWidth = Math.max(innerWidth - 1, 0);
	const padding = 2;

	const lines: string[] = [];

	// Title line with warning symbol
	const warnSymbol = colors.warning(symbols.warning);
	const titleText = colors.warning(title);
	const titleTextWidth = stringWidth(symbols.warning) + stringWidth(title);
	const barsNeeded = Math.max(innerWidth - titleTextWidth - 3, 1);
	const titleLine = `${warnSymbol}  ${titleText} ${colors.warning(symbols.barH.repeat(barsNeeded) + symbols.cornerTR)}`;

	lines.push(colors.warning(symbols.bar));
	lines.push(titleLine);

	// Empty line
	const emptyLine = `${colors.warning(symbols.bar)}${' '.repeat(contentWidth)}${colors.warning(symbols.bar)}`;
	lines.push(emptyLine);

	// Wrap and render content lines
	const wrapWidth = Math.max(contentWidth - padding * 2, 0);
	const contentLines = message.split('\n');
	for (const line of contentLines) {
		const wrapped = stringWidth(line) > wrapWidth ? wrapText(line, wrapWidth) : [line];
		for (const wl of wrapped) {
			const lineLen = stringWidth(wl);
			const leftPad = padding;
			const rightPad = Math.max(contentWidth - lineLen - leftPad, 0);
			lines.push(
				`${colors.warning(symbols.bar)}${' '.repeat(leftPad)}${wl}${' '.repeat(rightPad)}${colors.warning(symbols.bar)}`
			);
		}
	}

	lines.push(emptyLine);

	// Bottom border
	lines.push(
		colors.warning(symbols.connect + symbols.barH.repeat(innerWidth - 1) + symbols.cornerBR)
	);

	console.log(lines.join('\n'));
}
