import path from 'node:path';

export async function fixDuplicateExportsInDirectory(dir: string, verbose = false) {
	if (verbose) {
		console.log(`Scanning for .js files in: ${dir}`);
	}

	const jsFiles = await getAllJsFiles(dir);
	if (verbose) {
		console.log(`Found ${jsFiles.length} .js files`);
		for (const js of jsFiles) {
			console.log(` + Processing ${js}`);
		}
	}

	if (jsFiles.length === 0) {
		if (verbose) {
			console.log('No .js files found');
		}
		return;
	}

	// Process all files in parallel
	const results = await Promise.all(
		jsFiles.map(async (filePath) => {
			try {
				const wasFixed = await fixDuplicateExportsInFile(filePath, verbose);
				return { filePath, wasFixed, error: null };
			} catch (error) {
				return { filePath, wasFixed: false, error };
			}
		})
	);

	// Report results
	const fixed = results.filter((r) => r.wasFixed);
	const errors = results.filter((r) => r.error);

	if (verbose) {
		console.log(`\nResults:`);
		console.log(`- Total files: ${jsFiles.length}`);
		console.log(`- Files fixed: ${fixed.length}`);
		console.log(`- Errors: ${errors.length}`);

		if (fixed.length > 0) {
			console.log('\nFixed files:');
			fixed.forEach(({ filePath }) => {
				console.log(`  - ${filePath}`);
			});
		}

		if (errors.length > 0) {
			console.log('\nErrors:');
			errors.forEach(({ filePath, error }) => {
				console.log(`  - ${filePath}: ${error}`);
			});
		}
	}
}

async function fixDuplicateExportsInFile(filePath: string, verbose = false): Promise<boolean> {
	const originalCode = await Bun.file(filePath).text();

	// Only fix __INVALID__REF__ - remove it from imports and exports
	let code = originalCode;

	// Pattern 1: __INVALID__REF__ at start with comma after: "__INVALID__REF__, foo" -> "foo"
	code = code.replace(/\b__INVALID__REF__\s*,\s*/g, '');

	// Pattern 2: __INVALID__REF__ at end with comma before: "foo, __INVALID__REF__" -> "foo"
	code = code.replace(/,\s*__INVALID__REF__\b/g, '');

	// Pattern 3: __INVALID__REF__ alone (shouldn't happen but handle it)
	code = code.replace(/\b__INVALID__REF__\b/g, '');

	// Remove duplicate export statements
	// Find all export { ... } statements (allow leading whitespace)
	const exportPattern = /^\s*export\s*\{([^}]+)\}\s*;?\s*$/gm;
	const exports: Array<{
		match: string;
		names: Set<string>;
		nameToSyntax: Map<string, string>;
		start: number;
		end: number;
	}> = [];
	let match;

	while ((match = exportPattern.exec(code)) !== null) {
		const nameToSyntax = new Map<string, string>();
		const names: string[] = [];

		match[1].split(',').forEach((n) => {
			const fullSyntax = n.trim();
			const parts = fullSyntax.split(/\s+as\s+/);
			const exportedName = parts.length > 1 ? parts[1].trim() : parts[0].trim();
			if (exportedName) {
				names.push(exportedName);
				nameToSyntax.set(exportedName, fullSyntax);
			}
		});

		exports.push({
			match: match[0],
			names: new Set(names),
			nameToSyntax,
			start: match.index,
			end: match.index + match[0].length,
		});
	}

	// Track which names we've seen and which export statements to remove/modify
	const seenNames = new Set<string>();
	const indicesToRemove: number[] = [];
	const modificationsNeeded = new Map<number, Set<string>>(); // index -> names to keep

	for (let i = 0; i < exports.length; i++) {
		const exp = exports[i];
		const duplicateNames = [...exp.names].filter((name) => seenNames.has(name));
		const newNames = [...exp.names].filter((name) => !seenNames.has(name));
		const allDuplicates = duplicateNames.length === exp.names.size;

		if (verbose && duplicateNames.length > 0) {
			console.log(`  Duplicate exports found in statement ${i}: ${duplicateNames.join(', ')}`);
		}

		if (allDuplicates && exp.names.size > 0) {
			// This entire export statement is a duplicate - remove it
			indicesToRemove.push(i);
			if (verbose) {
				console.log(`    -> Will remove entire statement`);
			}
		} else if (duplicateNames.length > 0) {
			// Partial duplicates - need to remove just the duplicate names
			modificationsNeeded.set(i, new Set(newNames));
			if (verbose) {
				console.log(`    -> Will keep only: ${newNames.join(', ')}`);
			}
			// Mark the new names as seen
			newNames.forEach((name) => seenNames.add(name));
		} else {
			// No duplicates - mark these names as seen
			exp.names.forEach((name) => seenNames.add(name));
		}
	}

	// Build patches for modifications and removals, then apply from end to preserve indices
	const patches: Array<{ start: number; end: number; replacement: string }> = [];

	// Partial duplicates: replace the export statement with only the kept names
	for (const [i, namesToKeep] of modificationsNeeded.entries()) {
		const exp = exports[i];
		const syntaxToKeep = [...namesToKeep].map((name) => exp.nameToSyntax.get(name)!);
		const newExport = `export { ${syntaxToKeep.join(', ')} };`;
		patches.push({ start: exp.start, end: exp.end, replacement: newExport });
	}

	// Full duplicates: remove the entire export statement
	for (const idx of indicesToRemove) {
		const exp = exports[idx];
		patches.push({ start: exp.start, end: exp.end, replacement: '' });
	}

	// Apply all patches from right to left so earlier indices remain valid
	patches.sort((a, b) => b.start - a.start);
	for (const { start, end, replacement } of patches) {
		code = code.slice(0, start) + replacement + code.slice(end);
	}
	// Nothing changed
	if (code === originalCode) {
		return false;
	}

	// Write the fixed content back to the file
	await Bun.write(filePath, code);

	if (verbose) {
		console.log(`\n🔧 Fixed exports in: ${filePath}`);
	}

	return true;
}

async function getAllJsFiles(dir: string): Promise<string[]> {
	const glob = new Bun.Glob('**/*.js');
	const files = await Array.fromAsync(glob.scan({ cwd: dir, dot: true }));
	return files.map((file) => path.join(dir, file));
}

async function main() {
	const dir = process.argv[2];
	if (!dir) {
		console.error('Usage: bun fix-duplicate-exports.ts <directory>');
		process.exit(1);
	}

	const { existsSync } = await import('node:fs');
	if (!existsSync(dir)) {
		console.error(`Error: Directory does not exist: ${dir}`);
		process.exit(1);
	}

	await fixDuplicateExportsInDirectory(dir, true);
}

if (import.meta.main) {
	await main();
}
