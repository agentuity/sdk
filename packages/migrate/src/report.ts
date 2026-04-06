/**
 * Terminal report renderer.
 *
 * Formats the DetectionResult into a clear, readable console report.
 * No dependencies on @agentuity/cli's TUI — we use raw ANSI codes so that
 * this package can be run standalone via `npx @agentuity/migrate`.
 */

import type { DetectionResult, Finding, Severity } from './detect';

// ---------------------------------------------------------------------------
// ANSI helpers (minimal, no deps)
// ---------------------------------------------------------------------------

const isTTY = process.stdout.isTTY ?? false;

const ansi = {
	reset: isTTY ? '\x1b[0m' : '',
	bold: isTTY ? '\x1b[1m' : '',
	dim: isTTY ? '\x1b[2m' : '',
	green: isTTY ? '\x1b[32m' : '',
	yellow: isTTY ? '\x1b[33m' : '',
	red: isTTY ? '\x1b[31m' : '',
	cyan: isTTY ? '\x1b[36m' : '',
	blue: isTTY ? '\x1b[34m' : '',
	magenta: isTTY ? '\x1b[35m' : '',
};

function bold(s: string) {
	return `${ansi.bold}${s}${ansi.reset}`;
}
function dim(s: string) {
	return `${ansi.dim}${s}${ansi.reset}`;
}
function green(s: string) {
	return `${ansi.green}${s}${ansi.reset}`;
}
function yellow(s: string) {
	return `${ansi.yellow}${s}${ansi.reset}`;
}
function red(s: string) {
	return `${ansi.red}${s}${ansi.reset}`;
}
function cyan(s: string) {
	return `${ansi.cyan}${s}${ansi.reset}`;
}

const SEVERITY_LABEL: Record<Severity, string> = {
	auto: green('  auto  '),
	guided: yellow(' guided '),
	manual: red(' manual '),
};

const SEVERITY_ICON: Record<Severity, string> = {
	auto: green('✓'),
	guided: yellow('⚠'),
	manual: red('✗'),
};

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function hr(width = 70): string {
	return dim('─'.repeat(width));
}

function heading(text: string): string {
	return `\n${bold(text)}\n${hr()}\n`;
}

function renderFinding(f: Finding, index: number): string {
	const label = SEVERITY_LABEL[f.severity];
	const icon = SEVERITY_ICON[f.severity];
	const num = dim(`${String(index + 1).padStart(2, ' ')}.`);
	const file = f.file ? dim(` [${f.file}]`) : '';
	const hint = f.hint ? `\n       ${dim(`↳ ${f.hint.replace(/\n/g, '\n         ')}`)}` : '';

	return `  ${num} [${label}] ${icon} ${f.message}${file}${hint}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function printReport(detection: DetectionResult): void {
	const { findings } = detection;

	const autoFindings = findings.filter((f) => f.severity === 'auto');
	const guidedFindings = findings.filter((f) => f.severity === 'guided');
	const manualFindings = findings.filter((f) => f.severity === 'manual');

	console.log(`\n${bold('━━━ Agentuity v1 → v2 Migration Report ━━━')}`);
	console.log(dim(`Project: ${detection.projectDir}`));

	if (findings.length === 0) {
		console.log(
			`\n${green('✓')} ${bold('No v1 patterns detected!')} ` +
				'This project may already be on v2.\n'
		);
		return;
	}

	// Summary counts
	console.log(
		`\n${bold('Summary:')} ` +
			`${green(String(autoFindings.length))} auto-fixable, ` +
			`${yellow(String(guidedFindings.length))} guided, ` +
			`${red(String(manualFindings.length))} manual`
	);

	// Auto-fixable
	if (autoFindings.length > 0) {
		console.log(heading('Auto-fixable (will be applied automatically)'));
		autoFindings.forEach((f, i) => console.log(renderFinding(f, i)));
	}

	// Guided
	if (guidedFindings.length > 0) {
		console.log(heading('Guided (applied with your review)'));
		guidedFindings.forEach((f, i) => console.log(renderFinding(f, i)));
	}

	// Manual
	if (manualFindings.length > 0) {
		console.log(heading('Manual (requires human action — tool will not touch these)'));
		manualFindings.forEach((f, i) => console.log(renderFinding(f, i)));
	}

	// Legend
	console.log(`\n${hr()}`);
	console.log(
		`${dim('Legend:')}  ` +
			`[${green('  auto  ')}] fully automated  ` +
			`[${yellow(' guided ')}] applied + verify  ` +
			`[${red(' manual ')}] instructions only`
	);
	console.log();
}

export function printStep(message: string): void {
	process.stdout.write(`  ${cyan('›')} ${message}…`);
}

export function printStepDone(detail?: string): void {
	const suffix = detail ? dim(` (${detail})`) : '';
	console.log(` ${green('✓')}${suffix}`);
}

export function printStepSkipped(reason: string): void {
	console.log(` ${dim(`skipped — ${reason}`)}`);
}

export function printStepFailed(reason: string): void {
	console.log(` ${red('✗')} ${reason}`);
}

export function printWarning(message: string): void {
	console.warn(`\n  ${yellow('⚠')}  ${yellow(bold('Warning:'))} ${message}\n`);
}

export function printError(message: string): void {
	console.error(`\n  ${red('✗')}  ${red(bold('Error:'))} ${message}\n`);
}

export function printSuccess(message: string): void {
	console.log(`\n${green('✓')} ${bold(message)}\n`);
}

export function printManualSummary(detection: DetectionResult): void {
	const manualFindings = detection.findings.filter((f) => f.severity === 'manual');
	if (manualFindings.length === 0) return;

	console.log(`\n${bold('━━━ Remaining Manual Steps ━━━')}\n`);
	manualFindings.forEach((f, i) => {
		console.log(`  ${dim(`${i + 1}.`)} ${red('✗')} ${f.message}`);
		if (f.file) console.log(`     ${dim(`File: ${f.file}`)}`);
		if (f.hint) {
			console.log(`\n     ${f.hint.split('\n').join('\n     ')}\n`);
		}
	});
}

export function printChangeSummary(allChanges: { file: string; changes: string[] }[]): void {
	if (allChanges.length === 0) return;

	console.log(`\n${bold('━━━ Applied Changes ━━━')}\n`);
	for (const { file, changes } of allChanges) {
		console.log(`  ${cyan(file)}`);
		for (const change of changes) {
			console.log(`    ${dim('→')} ${change}`);
		}
	}
	console.log();
}
