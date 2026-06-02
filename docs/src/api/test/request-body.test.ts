import { expect, test } from 'bun:test';
import { modelFromRequestBody, requiredStringFromRequestBody } from '../request-body';

test('modelFromRequestBody returns a trimmed model id when present', () => {
	expect(modelFromRequestBody({ model: ' anthropic/claude-opus-4-8 ' }, 'fallback')).toBe(
		'anthropic/claude-opus-4-8'
	);
});

test('modelFromRequestBody falls back for missing or invalid model ids', () => {
	expect(modelFromRequestBody({}, 'fallback')).toBe('fallback');
	expect(modelFromRequestBody({ model: '' }, 'fallback')).toBe('fallback');
	expect(modelFromRequestBody({ model: 123 }, 'fallback')).toBe('fallback');
	expect(modelFromRequestBody('not an object', 'fallback')).toBe('fallback');
});

test('requiredStringFromRequestBody returns a trimmed string field', () => {
	expect(requiredStringFromRequestBody({ query: ' office chair ' }, 'query')).toBe('office chair');
});

test('requiredStringFromRequestBody rejects missing, blank, and non-string fields', () => {
	expect(requiredStringFromRequestBody({}, 'query')).toBeUndefined();
	expect(requiredStringFromRequestBody({ query: '' }, 'query')).toBeUndefined();
	expect(requiredStringFromRequestBody({ query: 123 }, 'query')).toBeUndefined();
	expect(requiredStringFromRequestBody(null, 'query')).toBeUndefined();
});
