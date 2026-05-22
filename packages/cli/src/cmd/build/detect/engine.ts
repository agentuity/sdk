/**
 * Framework detection engine.
 *
 * Evaluates detector rules from the framework database against a real project
 * directory. Handles three rule types:
 * - matchPackage: check if package exists in dependencies/devDependencies
 * - path: check if a file exists at the given path
 * - path + matchContent: check if a file exists AND its content matches a regex
 *
 * The `every` array requires ALL rules to match.
 * The `some` array requires at least ONE rule to match.
 * If both are present, both conditions must be satisfied.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathExists } from '../../../node-compat/fs.ts';
import type { DetectorRule, FrameworkDefinition } from './frameworks.ts';
import type { PackageJsonData } from './types.ts';

/**
 * Check if a single detector rule matches the project.
 */
async function matchRule(
	rule: DetectorRule,
	projectDir: string,
	pkg: PackageJsonData
): Promise<boolean> {
	// Package match: check dependencies and devDependencies
	if (rule.matchPackage) {
		const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
		return rule.matchPackage in allDeps;
	}

	// File path match (with optional content matching)
	if (rule.path) {
		const filePath = join(projectDir, rule.path);
		if (!(await pathExists(filePath))) return false;

		// If matchContent is specified, check file content against regex
		if (rule.matchContent) {
			try {
				const content = await readFile(filePath, 'utf-8');
				return new RegExp(rule.matchContent).test(content);
			} catch {
				return false;
			}
		}

		// File exists, no content check needed
		return true;
	}

	return false;
}

/**
 * Check if a framework definition matches the project.
 */
async function matchFramework(
	fw: FrameworkDefinition,
	projectDir: string,
	pkg: PackageJsonData
): Promise<boolean> {
	const { detectors } = fw;
	if (!detectors) return false;

	// Check 'every' rules: ALL must match
	if (detectors.every && detectors.every.length > 0) {
		for (const rule of detectors.every) {
			if (!(await matchRule(rule, projectDir, pkg))) {
				return false;
			}
		}
	}

	// Check 'some' rules: at least ONE must match
	if (detectors.some && detectors.some.length > 0) {
		let anyMatch = false;
		for (const rule of detectors.some) {
			if (await matchRule(rule, projectDir, pkg)) {
				anyMatch = true;
				break;
			}
		}
		if (!anyMatch) return false;
	}

	// If we have 'every' rules and they all matched (and 'some' either matched or wasn't present), pass
	// If we only have 'some' rules and one matched, pass
	return true;
}

/**
 * Run detection against the framework database.
 * Returns the first matching framework definition, or null.
 *
 * The framework list is evaluated in order — more specific frameworks
 * should be listed before generic ones.
 */
export async function detectFromDatabase(
	projectDir: string,
	pkg: PackageJsonData,
	frameworkList: FrameworkDefinition[]
): Promise<FrameworkDefinition | null> {
	for (const fw of frameworkList) {
		if (await matchFramework(fw, projectDir, pkg)) {
			return fw;
		}
	}
	return null;
}
