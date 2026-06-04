import { expect, test } from 'bun:test';
import { decodeSandboxOutputEvent } from './useSandboxRunner';

test('decodeSandboxOutputEvent preserves literal marker text', () => {
	expect(decodeSandboxOutputEvent('hello\\nliteral ---OUTPUT--- text\\nstill payload')).toBe(
		'hello\nliteral ---OUTPUT--- text\nstill payload'
	);
});
