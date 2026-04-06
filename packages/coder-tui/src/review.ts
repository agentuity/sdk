/**
 * Interactive code review command.
 *
 * Provides `/review` with 4 modes:
 *   1. PR-style review against a base branch
 *   2. Review uncommitted changes (staged + unstaged)
 *   3. Review a specific commit
 *   4. Custom review instructions (no diff)
 *
 * Gathers diff/instructions, parses stats, and sends
 * a formatted review prompt to the @reviewer agent.
 */
import type { ExtensionAPI, ExtensionCommandContext } from '@mariozechner/pi-coding-agent';
import { execFileSync } from 'node:child_process';

// ── Noise Filters ──
// Files excluded from diff stats (still included in the diff itself for context)
const EXCLUDED_PATTERNS = [
	/\.(lock|lockb)$/, // lock files
	/\.min\.(js|css)$/, // minified
	/\.(png|jpg|jpeg|gif|svg|ico|webp)$/, // images
	/\.(woff|woff2|ttf|eot)$/, // fonts
	/node_modules\//, // dependencies
	/\.map$/, // source maps
];

const MAX_DIFF_SIZE = 100_000; // 100KB max for context window

// ── Types ──

interface DiffStats {
	files: number;
	added: number;
	removed: number;
	excludedFiles: string[];
}

// ── Git Helpers ──

function execGit(args: string[]): string {
	try {
		return execFileSync('git', args, {
			encoding: 'utf-8',
			maxBuffer: 5 * 1024 * 1024,
			stdio: ['pipe', 'pipe', 'pipe'],
		});
	} catch (err: unknown) {
		const stderr =
			err && typeof err === 'object' && 'stderr' in err ? String((err as any).stderr) : '';
		const msg = err instanceof Error ? err.message : String(err);
		if (process.env['AGENTUITY_DEBUG']) {
			console.error(`[agentuity-coder] git ${args.join(' ')} failed: ${stderr || msg}`);
		}
		return '';
	}
}

function execGitDiff(diffArgs: string[]): string {
	return execGit(['diff', ...diffArgs]);
}

function execGitShow(hash: string): string {
	return execGit(['show', hash]);
}

// ── Diff Parsing ──

function isExcluded(filePath: string): boolean {
	return EXCLUDED_PATTERNS.some((pattern) => pattern.test(filePath));
}

function parseDiffStats(diff: string): DiffStats {
	if (!diff.trim()) {
		return { files: 0, added: 0, removed: 0, excludedFiles: [] };
	}

	// Split on "diff --git" boundaries
	const fileDiffs = diff.split(/^diff --git /m).filter(Boolean);

	let files = 0;
	let added = 0;
	let removed = 0;
	const excludedFiles: string[] = [];

	for (const fileDiff of fileDiffs) {
		// Extract file path from "a/path b/path" header
		const headerMatch = fileDiff.match(/^a\/(.+?) b\//);
		if (!headerMatch) continue;
		const filePath = headerMatch[1] ?? '';

		if (isExcluded(filePath)) {
			excludedFiles.push(filePath);
			continue;
		}

		files++;

		// Count added/removed lines (lines starting with + or - but not headers)
		const lines = fileDiff.split('\n');
		for (const line of lines) {
			if (line.startsWith('+') && !line.startsWith('+++')) {
				added++;
			} else if (line.startsWith('-') && !line.startsWith('---')) {
				removed++;
			}
		}
	}

	return { files, added, removed, excludedFiles };
}

// ── Review Prompt Builder ──

function buildReviewPrompt(context: string, diff: string, stats: DiffStats): string {
	const header = `## Code Review Request\n\n${context}\n\n**Stats:** ${stats.files} files changed, +${stats.added}/-${stats.removed} lines`;

	const excludedNote =
		stats.excludedFiles.length > 0
			? `\n\n_Excluded from stats: ${stats.excludedFiles.length} noise files (lock files, images, etc.)_`
			: '';

	// Truncate diff if too large
	let diffContent = diff;
	if (diff.length > MAX_DIFF_SIZE) {
		diffContent = `${diff.slice(0, MAX_DIFF_SIZE)}\n\n[Diff truncated - too large for review]`;
	}

	return `${header}${excludedNote}\n\n\`\`\`diff\n${diffContent}\n\`\`\`\n\nPlease review these changes for:\n1. Correctness and potential bugs\n2. Security concerns\n3. Code quality and best practices\n4. Performance implications`;
}

// ── Main Handler ──

export async function handleReview(
	_args: string,
	ctx: ExtensionCommandContext,
	pi: ExtensionAPI
): Promise<void> {
	// Non-interactive fallback
	if (!ctx.hasUI) {
		pi.sendUserMessage('@reviewer Review recent code changes', { deliverAs: 'followUp' });
		return;
	}

	// Show mode selector
	const mode = await ctx.ui.select('Review Mode', [
		'Review against a base branch (PR Style)',
		'Review uncommitted changes',
		'Review a specific commit',
		'Custom review instructions',
	]);

	if (!mode) return;

	let diff = '';
	let context = '';

	if (mode.includes('base branch')) {
		const branch = await ctx.ui.input('Base branch', 'main');
		if (!branch) return;
		diff = execGitDiff([`${branch}...HEAD`]);
		if (!diff.trim()) {
			ctx.ui.notify(`No changes found between ${branch} and HEAD`, 'warning');
			return;
		}
		context = `Reviewing changes from ${branch} to HEAD`;
	} else if (mode.includes('uncommitted')) {
		const staged = execGitDiff(['--cached']);
		const unstaged = execGitDiff([]);
		diff = `${staged}\n${unstaged}`;
		if (!diff.trim()) {
			ctx.ui.notify('No uncommitted changes found', 'warning');
			return;
		}
		context = 'Reviewing uncommitted changes (staged + unstaged)';
	} else if (mode.includes('specific commit')) {
		const hash = await ctx.ui.input('Commit hash', '');
		if (!hash) return;
		diff = execGitShow(hash);
		if (!diff.trim()) {
			ctx.ui.notify(`No diff found for commit ${hash}`, 'warning');
			return;
		}
		context = `Reviewing commit ${hash}`;
	} else {
		// Custom instructions — no diff
		const instructions = await ctx.ui.input('Review instructions', '');
		if (!instructions) return;
		pi.sendUserMessage(`@reviewer ${instructions}`, { deliverAs: 'followUp' });
		return;
	}

	// Parse diff stats
	const stats = parseDiffStats(diff);

	// Show summary notification
	ctx.ui.notify(`${context}: ${stats.files} files, +${stats.added}/-${stats.removed}`, 'info');

	// Compose and send review message
	const reviewPrompt = buildReviewPrompt(context, diff, stats);
	pi.sendUserMessage(`@reviewer ${reviewPrompt}`, { deliverAs: 'followUp' });
}
