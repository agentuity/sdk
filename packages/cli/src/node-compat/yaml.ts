/**
 * YAML helpers.
 *
 * Re-export of the `yaml` npm package's parse/stringify with the
 * names that match Bun's previous `import { YAML } from 'bun'`
 * surface. Centralized so that if we ever swap to a different YAML
 * library (or back to Bun's built-in under conditional imports), all
 * call sites move at once.
 *
 * Behavior parity with `Bun.YAML.{parse,stringify}` is approximate.
 * The `yaml` package follows the YAML 1.2 spec strictly; Bun's
 * built-in is also 1.2 but may differ on edge cases (anchors,
 * multi-document, exotic scalar styles). For the CLI's profile and
 * snapshot YAML, both produce identical output, but verify when
 * migrating any new YAML interaction.
 */

import { parse, stringify } from 'yaml';

/** Parse a YAML document into a JavaScript value. */
export function parseYaml<T = unknown>(text: string): T {
	return parse(text) as T;
}

/** Stringify a JavaScript value to a YAML document. */
export function stringifyYaml(value: unknown): string {
	return stringify(value);
}
