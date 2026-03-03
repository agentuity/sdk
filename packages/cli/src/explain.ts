import type { GlobalOptions } from './types';
import * as tui from './tui';

/**
 * Utilities for explain mode and dry-run mode
 */

/**
 * Check if explain mode is enabled
 */
export function isExplainMode(options: GlobalOptions): boolean {
	return options.explain === true;
}

/**
 * Check if dry-run mode is enabled
 */
export function isDryRunMode(options: GlobalOptions): boolean {
	return options.dryRun === true;
}

/**
 * Check if the command should execute (not explain, not dry-run unless specifically handling dry-run)
 */
export function shouldExecute(options: GlobalOptions): boolean {
	return !options.explain && !options.dryRun;
}

/**
 * Explanation step for a command action
 */
export interface ExplainStep {
	action: string;
	details?: Record<string, unknown>;
}

/**
 * Explanation plan for a command
 */
export interface ExplainPlan {
	command: string;
	description: string;
	prerequisites?: string[];
	steps: ExplainStep[];
	warnings?: string[];
	estimatedDuration?: string;
}

/**
 * Output an explanation plan
 */
export function outputExplain(plan: ExplainPlan, options: GlobalOptions): void {
	if (options.json) {
		console.log(JSON.stringify({ explain: plan }, null, 2));
		return;
	}

	// Human-readable output
	console.log(tui.bold('Command Explanation:'));
	console.log(`  ${plan.command}`);
	tui.newline();

	if (plan.description) {
		console.log(tui.bold('Description:'));
		console.log(`  ${plan.description}`);
		tui.newline();
	}

	if (plan.prerequisites && plan.prerequisites.length > 0) {
		console.log(tui.bold('Prerequisites:'));
		for (const prereq of plan.prerequisites) {
			console.log(`  ${tui.bullet} ${prereq}`);
		}
		tui.newline();
	}

	console.log(tui.bold('This command will:'));
	for (const step of plan.steps) {
		console.log(`  • ${step.action}`);
		if (step.details && Object.keys(step.details).length > 0) {
			for (const [key, value] of Object.entries(step.details)) {
				console.log(`    ${tui.muted(`${key}: ${JSON.stringify(value)}`)}`);
			}
		}
	}
	tui.newline();

	if (plan.warnings && plan.warnings.length > 0) {
		console.log(tui.bold('Warnings:'));
		for (const warn of plan.warnings) {
			console.log(`  ⚠ ${warn}`);
		}
		tui.newline();
	}

	if (plan.estimatedDuration) {
		console.log(tui.muted(`Estimated duration: ${plan.estimatedDuration}`));
		tui.newline();
	}
}

/**
 * Create a simple explain plan
 */
export function createExplainPlan(
	command: string,
	description: string,
	steps: string[]
): ExplainPlan {
	return {
		command,
		description,
		steps: steps.map((action) => ({ action })),
	};
}

/**
 * Output dry-run result
 */
export function outputDryRun(message: string, options: GlobalOptions): void {
	if (options.json) {
		console.log(JSON.stringify({ dryRun: true, message }, null, 2));
	} else {
		console.log(tui.muted('[DRY RUN] ') + message);
	}
}
