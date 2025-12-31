import { parse, type GrammarItem } from '@aivenio/tsc-output-parser';
import { formatTypeScriptErrors, hasErrors } from '../../typescript-errors';

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

/**
 * run the typescript compiler and result formatted results
 *
 * @param dir the absolute path to the directory containing the project (must have tsconfig.json in this folder)
 * @returns
 */
export async function typecheck(dir: string): Promise<TypeResult> {
	const result = await Bun.$`bunx tsc --noEmit --skipLibCheck`.cwd(dir).quiet().nothrow();

	const output = await result.text();
	const errors = parse(output) as GrammarItem[];

	if (result.exitCode === 0) {
		return {
			success: true,
		};
	} else if (errors && hasErrors(errors)) {
		const formattedErrors = await formatTypeScriptErrors(errors, {
			projectDir: dir,
		});
		return {
			success: false,
			errors,
			output: formattedErrors,
		};
	} else {
		return {
			success: false,
			output: output || result.stderr.toString(),
		};
	}
}
