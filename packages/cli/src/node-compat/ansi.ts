/**
 * ANSI / terminal-styling helpers.
 *
 * Replacements for the Bun-specific `Bun.color`, `Bun.stringWidth`,
 * and `Bun.stripANSI` APIs used by `tui.ts` and `banner.ts`.
 *
 * - `color(spec, mode)` returns the SGR (Select Graphic Rendition)
 *   escape that selects the given foreground color. Mirrors Bun's
 *   `Bun.color('cyan', 'ansi-16m')` /
 *   `Bun.color('#5C9CFF', 'ansi')` shape:
 *   - `mode: 'ansi-16m'` -> 24-bit truecolor (`\\x1b[38;2;R;G;Bm`).
 *     Wide compatibility on modern terminals.
 *   - `mode: 'ansi'`    -> 16-color palette
 *     (`\\x1b[3{0-7}m` / `\\x1b[9{0-7}m`). Use when the consumer
 *     needs to land on dumb terminals.
 *
 * - `stringWidth(s)` is re-exported from the `string-width` npm
 *   package. Inlining a correct implementation that handles emoji,
 *   CJK, ZWJ sequences, and ANSI escapes is ~150 lines of edge
 *   cases that the npm package already gets right.
 *
 * - `stripAnsi(s)` removes SGR (color/style) escape sequences. The
 *   CLI only feeds this with logger output, so SGR-only stripping
 *   suffices; we don't try to handle cursor or OSC codes.
 */

import stringWidthLib from 'string-width';

/** Re-export of the `string-width` npm package's default export. */
export const stringWidth = stringWidthLib;

/** Color rendering modes accepted by `color()`. Mirrors `Bun.color`. */
export type ColorMode = 'ansi' | 'ansi-16m';

/**
 * Color spec: either a CSS named color (a small subset that the CLI
 * actually uses) or a `#RRGGBB` hex string.
 */
export type ColorSpec = NamedColor | `#${string}`;

/**
 * Return the SGR escape sequence that sets the foreground color to
 * `spec` in the requested rendering `mode`. Returns an empty string
 * if the spec cannot be resolved (rather than throwing) so callers
 * can use the result inline without nesting null checks.
 */
export function color(spec: ColorSpec, mode: ColorMode = 'ansi-16m'): string {
	if (spec.startsWith('#')) {
		const rgb = parseHex(spec);
		if (!rgb) return '';
		if (mode === 'ansi') {
			return ansi16FromRgb(rgb);
		}
		return ansi24FromRgb(rgb);
	}
	const named = NAMED_COLORS[spec as NamedColor];
	if (!named) return '';
	if (mode === 'ansi') {
		return `\x1b[${named.ansi}m`;
	}
	return ansi24FromRgb(named.rgb);
}

/**
 * Strip SGR (color/style) escape sequences from `s`. Cursor /
 * OSC / DCS sequences are left in place; the CLI doesn't generate
 * them in places that flow through `stripAnsi`.
 */
export function stripAnsi(s: string): string {
	// Matches CSI ... m sequences (the SGR family). The leading 0x1b
	// is the ESC byte; biome's noControlCharactersInRegex rule is off
	// at the project level for this exact reason.
	return s.replace(/\x1b\[[0-9;]*m/g, '');
}

// =============================================================================
// Internal helpers
// =============================================================================

interface RgbTriple {
	r: number;
	g: number;
	b: number;
}

/**
 * Subset of CSS named colors actually used by the CLI today. Each
 * carries both its RGB triple (for 24-bit mode) and its 16-color
 * SGR code (for `ansi` mode).
 *
 * If a future call site needs a color not listed here, add it to
 * this map rather than falling back to a hex literal at the call
 * site. Keeping the named-color list short is intentional.
 */
const NAMED_COLORS = {
	black: { rgb: { r: 0, g: 0, b: 0 }, ansi: 30 },
	red: { rgb: { r: 205, g: 49, b: 49 }, ansi: 31 },
	green: { rgb: { r: 13, g: 188, b: 121 }, ansi: 32 },
	yellow: { rgb: { r: 229, g: 229, b: 16 }, ansi: 33 },
	blue: { rgb: { r: 36, g: 114, b: 200 }, ansi: 34 },
	magenta: { rgb: { r: 188, g: 63, b: 188 }, ansi: 35 },
	cyan: { rgb: { r: 17, g: 168, b: 205 }, ansi: 36 },
	white: { rgb: { r: 229, g: 229, b: 229 }, ansi: 37 },
	gray: { rgb: { r: 128, g: 128, b: 128 }, ansi: 90 },
} satisfies Record<string, { rgb: RgbTriple; ansi: number }>;

type NamedColor = keyof typeof NAMED_COLORS;

function parseHex(hex: string): RgbTriple | null {
	const cleaned = hex.startsWith('#') ? hex.slice(1) : hex;
	if (cleaned.length === 3) {
		const r = Number.parseInt(cleaned[0]! + cleaned[0], 16);
		const g = Number.parseInt(cleaned[1]! + cleaned[1], 16);
		const b = Number.parseInt(cleaned[2]! + cleaned[2], 16);
		if ([r, g, b].some(Number.isNaN)) return null;
		return { r, g, b };
	}
	if (cleaned.length === 6) {
		const r = Number.parseInt(cleaned.slice(0, 2), 16);
		const g = Number.parseInt(cleaned.slice(2, 4), 16);
		const b = Number.parseInt(cleaned.slice(4, 6), 16);
		if ([r, g, b].some(Number.isNaN)) return null;
		return { r, g, b };
	}
	return null;
}

function ansi24FromRgb({ r, g, b }: RgbTriple): string {
	return `\x1b[38;2;${r};${g};${b}m`;
}

/**
 * Approximate an arbitrary RGB triple to the closest of the 16
 * basic ANSI colors. Uses Euclidean distance over the standard
 * VGA-ish reference palette. Good enough for the few legacy
 * call sites that still pass `mode: 'ansi'`.
 */
function ansi16FromRgb(rgb: RgbTriple): string {
	let bestCode = 37;
	let bestDist = Number.POSITIVE_INFINITY;
	for (const named of Object.values(NAMED_COLORS)) {
		const dr = rgb.r - named.rgb.r;
		const dg = rgb.g - named.rgb.g;
		const db = rgb.b - named.rgb.b;
		const dist = dr * dr + dg * dg + db * db;
		if (dist < bestDist) {
			bestDist = dist;
			bestCode = named.ansi;
		}
	}
	return `\x1b[${bestCode}m`;
}
