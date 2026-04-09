import { join } from 'node:path';
import { parse, type GrammarItem } from '../../tsc-output-parser';
import { formatTypeScriptErrors, hasErrors } from '../../typescript-errors';
import type { BuildReportCollector } from '../../build-report';

interface TypeError {
	success: false;
	errors: GrammarItem[];
	output: string;
}

interface TypeUnknownError {
	success: false;
	output: string;
}

interface TypeSuccess {
	success: true;
}

type TypeResult = TypeError | TypeSuccess | TypeUnknownError;

export interface TypecheckOptions {
	/** Optional collector for structured error reporting */
	collector?: BuildReportCollector;
}

/**
 * Filter tsc output to remove lines referencing node_modules paths.
 *
 * Some packages (e.g. @agentuity/runtime) ship .ts source files, which
 * --skipLibCheck does not skip. Errors from those paths can crash the
 * PEG-based tsc-output-parser because the parser expects every non-blank
 * line to be a valid tsc error item.  Stripping these lines before parsing
 * prevents the crash and avoids surfacing errors the user cannot fix.
 *
 * We also strip continuation lines (indented with 2+ leading spaces) that
 * follow a node_modules error line, as they are part of the same diagnostic.
 */
function filterNodeModulesErrors(output: string): string {
	const lines = output.split('\n');
	const filtered: string[] = [];
	let skipping = false;

	for (const line of lines) {
		// A tsc error line starts with a path, e.g. "node_modules/..." or "../node_modules/..."
		// Also handle Windows-style paths with backslashes
		const isNodeModulesError =
			/^\.{0,2}[/\\]?node_modules[/\\]/.test(line) ||
			/^[A-Za-z]:[/\\].*node_modules[/\\]/.test(line);

		if (isNodeModulesError) {
			skipping = true;
			continue;
		}

		// Continuation lines of a multi-line tsc diagnostic start with whitespace
		if (skipping && /^\s{2,}/.test(line)) {
			continue;
		}

		skipping = false;
		filtered.push(line);
	}

	return filtered.join('\n');
}

/**
 * run the typescript compiler and result formatted results
 *
 * @param dir the absolute path to the directory containing the project (must have tsconfig.json in this folder)
 * @param options optional configuration including error collector
 * @returns
 */
export async function typecheck(dir: string, options?: TypecheckOptions): Promise<TypeResult> {
	// Skip typecheck for projects without tsconfig.json (plain JS projects)
	const tsconfigPath = join(dir, 'tsconfig.json');
	const tsconfigFile = Bun.file(tsconfigPath);
	const tsconfigExists = await tsconfigFile.exists();
	if (!tsconfigExists) {
		return { success: true };
	}

	const { collector } = options ?? {};
	const result = await Bun.$`bunx tsc --noEmit --skipLibCheck --pretty false`
		.cwd(dir)
		.quiet()
		.nothrow();

	const output = await result.text();

	// Filter out node_modules errors before parsing to prevent parser crashes.
	// The PEG parser is strict and fails on lines it cannot match as tsc error items.
	const filteredOutput = filterNodeModulesErrors(output);

	let errors: GrammarItem[];
	try {
		errors = parse(filteredOutput) as GrammarItem[];
	} catch {
		// If the parser still fails (e.g. unexpected tsc output format), treat as
		// an unknown error and show the raw output instead of crashing.
		if (collector) {
			collector.addGeneralError('typescript', output || result.stderr.toString());
		}
		return {
			success: false,
			output: output || result.stderr.toString(),
		};
	}

	if (result.exitCode === 0) {
		return {
			success: true,
		};
	} else if (errors && hasErrors(errors)) {
		// Add errors to collector if provided
		if (collector) {
			collector.addTypeScriptErrors(errors);
		}

		const formattedErrors = await formatTypeScriptErrors(errors, {
			projectDir: dir,
		});
		return {
			success: false,
			errors,
			output: formattedErrors,
		};
	} else {
		// Unknown error - add to collector as general error
		if (collector) {
			collector.addGeneralError('typescript', output || result.stderr.toString());
		}

		return {
			success: false,
			output: output || result.stderr.toString(),
		};
	}
}
