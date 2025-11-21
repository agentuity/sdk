#!/usr/bin/env bun
/**
 * Test script to verify command tags are correctly applied
 */

import type { CommandDefinition, SubcommandDefinition } from '../src/types';

interface ValidationResult {
	file: string;
	commandName: string;
	issues: string[];
	tags: string[];
}

const VALID_TAGS = new Set([
	// Destructiveness
	'read-only',
	'mutating',
	'destructive',
	// Performance
	'fast',
	'slow',
	'api-intensive',
	// Resource Impact
	'creates-resource',
	'updates-resource',
	'deletes-resource',
	// State Requirements
	'requires-auth',
	'requires-project',
	'requires-deployment',
]);

const INCOMPATIBLE_TAGS: Record<string, string[]> = {
	'read-only': ['mutating', 'destructive'],
	mutating: ['read-only', 'destructive'],
	destructive: ['read-only', 'mutating'],
};

async function validateCommandFile(filePath: string): Promise<ValidationResult[]> {
	const results: ValidationResult[] = [];

	try {
		// Import the module
		const mod = await import(`../${filePath}`);

		// Find all command exports (exclude utility functions like discoverCommands)
		for (const [exportName, exportValue] of Object.entries(mod)) {
			if (
				(exportName.includes('Command') ||
					exportName.includes('command') ||
					exportName.includes('Subcommand')) &&
				exportName !== 'discoverCommands'
			) {
				const cmd = exportValue as CommandDefinition | SubcommandDefinition;
				const issues: string[] = [];
				const tags = (cmd as { tags?: string[] }).tags || [];

				// Check if command has tags
				if (!tags || tags.length === 0) {
					issues.push('Missing tags');
				} else {
					// Validate tags
					for (const tag of tags) {
						if (!VALID_TAGS.has(tag)) {
							issues.push(`Invalid tag: ${tag}`);
						}
					}

					// Check for incompatible tags
					for (const tag of tags) {
						const incompatible = INCOMPATIBLE_TAGS[tag];
						if (incompatible) {
							for (const badTag of incompatible) {
								if (tags.includes(badTag)) {
									issues.push(`Incompatible tags: ${tag} and ${badTag}`);
								}
							}
						}
					}

					// Destructive commands should have deletes-resource
					if (tags.includes('destructive') && !tags.includes('deletes-resource')) {
						issues.push('Destructive command should have deletes-resource tag');
					}

					// Read-only commands shouldn't have resource impact tags
					if (tags.includes('read-only')) {
						const resourceTags = ['creates-resource', 'updates-resource', 'deletes-resource'];
						for (const resourceTag of resourceTags) {
							if (tags.includes(resourceTag)) {
								issues.push(`Read-only command should not have ${resourceTag} tag`);
							}
						}
					}
				}

				results.push({
					file: filePath,
					commandName: cmd.name,
					issues,
					tags,
				});
			}
		}
	} catch (error) {
		console.error(`Error loading ${filePath}:`, error);
	}

	return results;
}

async function main() {
	console.log('🔍 Validating command tags...\n');

	const allResults: ValidationResult[] = [];
	const tagCounts: Record<string, number> = {};

	// Find all command files
	const pattern = new Bun.Glob('src/cmd/**/*.ts');
	const files = [];

	for await (const file of pattern.scan('.')) {
		// Skip test, util, api, template files
		if (
			file.includes('.test.') ||
			file.includes('/util') ||
			file.includes('/api') ||
			file.includes('/templates') ||
			file.includes('/flow') ||
			file.includes('/bundler') ||
			file.includes('/plugin') ||
			file.includes('/patch') ||
			file.includes('/ast') ||
			file.includes('/file') ||
			file.includes('/download') ||
			file.includes('/domain')
		) {
			continue;
		}
		files.push(file);
	}

	console.log(`Found ${files.length} command files\n`);

	for (const file of files) {
		const results = await validateCommandFile(file);
		allResults.push(...results);

		// Count tags
		for (const result of results) {
			for (const tag of result.tags) {
				tagCounts[tag] = (tagCounts[tag] || 0) + 1;
			}
		}
	}

	// Print results
	const withoutTags = allResults.filter((r) => r.issues.includes('Missing tags'));
	const withErrors = allResults.filter(
		(r) => r.issues.length > 0 && !r.issues.includes('Missing tags')
	);

	if (withErrors.length > 0) {
		console.log('❌ Commands with errors:\n');
		for (const result of withErrors) {
			console.log(`  ${result.commandName} (${result.file})`);
			for (const issue of result.issues) {
				console.log(`    - ${issue}`);
			}
			console.log();
		}
	}

	if (withoutTags.length > 0) {
		console.log('⚠️  Commands without tags:\n');
		for (const result of withoutTags) {
			console.log(`  ${result.commandName} (${result.file})`);
		}
		console.log();
	}

	console.log('📊 Summary:\n');
	console.log(`  Total commands: ${allResults.length}`);
	console.log(`  Commands with tags: ${allResults.length - withoutTags.length}`);
	console.log(`  Commands with issues: ${withErrors.length}`);
	console.log(`  Commands missing tags: ${withoutTags.length}`);

	console.log('\n📈 Tag distribution:\n');
	const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
	for (const [tag, count] of sortedTags) {
		const percentage = ((count / allResults.length) * 100).toFixed(1);
		console.log(`  ${tag}: ${count} (${percentage}%)`);
	}

	if (withErrors.length > 0 || withoutTags.length > 0) {
		process.exit(1);
	}
}

main().catch(console.error);
