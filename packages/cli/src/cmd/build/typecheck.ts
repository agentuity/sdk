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
 * run the typescript compiler and result formatted results
 *
 * @param dir the absolute path to the directory containing the project (must have tsconfig.json in this folder)
 * @param options optional configuration including error collector
 * @returns
 */
export async function typecheck(dir: string, options?: TypecheckOptions): Promise<TypeResult> {
	const { collector } = options ?? {};
	const result = await Bun.$`bunx tsc --noEmit --skipLibCheck --pretty false`
		.cwd(dir)
		.quiet()
		.nothrow();

	const output = await result.text();
	const errors = parse(output) as GrammarItem[];

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
