import { generatePatches as aisdkGeneratePatches } from './aisdk';
import { generatePatches as llmGeneratePatches } from './llm';
import { type PatchModule, searchBackwards } from './_util';

export function generatePatches(): Map<string, PatchModule> {
	const patches = new Map<string, PatchModule>();
	for (const [name, patch] of aisdkGeneratePatches()) {
		patches.set(name, patch);
	}
	for (const [name, patch] of llmGeneratePatches()) {
		patches.set(name, patch);
	}
	return patches;
}

export async function applyPatch(
	filename: string,
	patch: PatchModule
): Promise<[string, Bun.Loader]> {
	let contents = await Bun.file(filename).text();
	const isJS = filename.endsWith('.js') || filename.endsWith('.mjs');
	let suffix = '';
	if (patch.functions) {
		for (const fn of Object.keys(patch.functions)) {
			const mod = patch.functions[fn];
			let fnname = `function ${fn}`;
			let index = contents.indexOf(fnname);
			let isConstVariable = false;
			if (index === -1) {
				fnname = 'const ' + fn + ' = ';
				index = contents.indexOf(fnname);
				isConstVariable = true;
				if (index === -1) {
					continue;
				}
			}
			const eol = searchBackwards(contents, index, '\n');
			if (eol < 0) {
				continue;
			}
			const prefix = contents.substring(eol + 1, index).trim();
			const isAsync = prefix.includes('async');
			const isExport = prefix.includes('export');
			const newname = '__agentuity_' + fn;
			let newfnname: string;
			if (isConstVariable) {
				newfnname = 'const ' + newname + ' = ';
			} else {
				newfnname = 'function ' + newname;
			}
			let fnprefix = '';
			if (isAsync) {
				fnprefix = 'async ';
			}
			if (isExport) {
				fnprefix += 'export ' + fnprefix;
			}
			contents = contents.replace(fnname, newfnname);
			if (isJS) {
				suffix += fnprefix + 'function ' + fn + '() {\n';
				suffix += 'let args = arguments;\n';
			} else {
				suffix += fnprefix + fnname + '(...args) {\n';
			}
			suffix += '\tlet _args = args;\n';

			if (mod.before) {
				suffix += mod.before;
				suffix += '\n';
			}

			if (isJS) {
				// For JS: use .apply to preserve 'this' context
				suffix += '\tlet result = ' + newname + '.apply(this, _args);\n';
			} else {
				// For TS: use spread operator
				suffix += '\tlet result = ' + newname + '(..._args);\n';
			}

			if (isAsync) {
				suffix += '\tif (result instanceof Promise) {\n';
				suffix += '\t\tresult = await result;\n';
				suffix += '\t}\n';
			}
			if (mod.after) {
				suffix += mod.after;
				suffix += '\n';
			}
			suffix += '\treturn result;\n';
			suffix += '}\n';
			contents = contents + '\n' + suffix;
		}
	}
	if (patch.body?.before) {
		contents = patch.body.before + '\n' + contents;
	}
	if (patch.body?.after) {
		contents = contents + '\n' + patch.body.after;
	}
	return [contents, isJS ? 'js' : 'ts'];
}
