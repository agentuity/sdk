#!/usr/bin/env bun
/**
 * Verify that tags appear in the generated CLI schema
 */

import { discoverCommands } from '../src/cmd';
import { generateCLISchema } from '../src/schema-generator';
import type { Command } from 'commander';

async function main() {
	console.log('🔍 Verifying tags appear in schema output...\n');

	// Discover commands
	const commands = await discoverCommands();
	console.log(`Discovered ${commands.length} commands\n`);

	// Generate schema
	const program = {} as Command;
	const schema = generateCLISchema(program, commands, '1.0.0');

	// Check for tags in schema
	let totalCommands = 0;
	let commandsWithTags = 0;
	const tagCounts: Record<string, number> = {};

	function checkCommand(
		cmd: { name: string; tags?: string[]; subcommands?: unknown[] },
		depth = 0
	) {
		totalCommands++;
		const indent = '  '.repeat(depth);

		if (cmd.tags && cmd.tags.length > 0) {
			commandsWithTags++;
			console.log(`${indent}✓ ${cmd.name}: ${cmd.tags.join(', ')}`);

			// Count tags
			for (const tag of cmd.tags) {
				tagCounts[tag] = (tagCounts[tag] || 0) + 1;
			}
		} else {
			console.log(`${indent}⚠️  ${cmd.name}: NO TAGS`);
		}

		// Check subcommands
		if (cmd.subcommands) {
			for (const sub of cmd.subcommands) {
				checkCommand(sub, depth + 1);
			}
		}
	}

	// Check all commands
	for (const cmd of schema.commands) {
		checkCommand(cmd);
	}

	console.log('\n📊 Summary:\n');
	console.log(`  Total commands checked: ${totalCommands}`);
	console.log(`  Commands with tags: ${commandsWithTags}`);
	console.log(`  Commands without tags: ${totalCommands - commandsWithTags}`);
	console.log(`  Coverage: ${((commandsWithTags / totalCommands) * 100).toFixed(1)}%`);

	console.log('\n📈 Tag distribution in schema:\n');
	const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
	for (const [tag, count] of sortedTags) {
		console.log(`  ${tag}: ${count} commands`);
	}

	if (commandsWithTags < totalCommands) {
		console.log('\n❌ Some commands are missing tags');
		process.exit(1);
	}

	console.log('\n✅ All commands have tags in schema!');
}

main().catch(console.error);
