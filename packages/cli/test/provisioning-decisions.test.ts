import { describe, expect, test } from 'bun:test';
import {
	flagRequiresProvisioning,
	resolveFlagAction,
	shouldPromptForResource,
} from '../src/cmd/project/provisioning-decisions';

describe('resolveFlagAction', () => {
	test('returns undefined when no flag is passed', () => {
		expect(resolveFlagAction(undefined)).toBeUndefined();
	});

	test("normalizes 'new' to 'Create New' (case-insensitive)", () => {
		expect(resolveFlagAction('new')).toBe('Create New');
		expect(resolveFlagAction('NEW')).toBe('Create New');
		expect(resolveFlagAction('New')).toBe('Create New');
	});

	test("normalizes 'skip' to 'Skip' (case-insensitive)", () => {
		expect(resolveFlagAction('skip')).toBe('Skip');
		expect(resolveFlagAction('SKIP')).toBe('Skip');
	});

	test('returns the input as-is for other values (existing resource names)', () => {
		expect(resolveFlagAction('my-db')).toBe('my-db');
		expect(resolveFlagAction('Project_Name_42')).toBe('Project_Name_42');
	});
});

describe('shouldPromptForResource', () => {
	test('flag=Skip wins over service selection', () => {
		expect(shouldPromptForResource({ flagAction: 'Skip', inServiceSelection: true })).toBe(false);
	});

	test('flag=Create New triggers prompt', () => {
		expect(shouldPromptForResource({ flagAction: 'Create New', inServiceSelection: false })).toBe(
			true
		);
	});

	test('flag=existing-name triggers prompt', () => {
		expect(shouldPromptForResource({ flagAction: 'my-bucket', inServiceSelection: false })).toBe(
			true
		);
	});

	test('service in selection without flag triggers prompt', () => {
		expect(shouldPromptForResource({ flagAction: undefined, inServiceSelection: true })).toBe(
			true
		);
	});

	test('no flag and not in selection: no prompt', () => {
		expect(shouldPromptForResource({ flagAction: undefined, inServiceSelection: false })).toBe(
			false
		);
	});
});

describe('flagRequiresProvisioning', () => {
	test('undefined flag does not require provisioning', () => {
		expect(flagRequiresProvisioning(undefined)).toBe(false);
	});

	test("'skip' flag does not require provisioning", () => {
		expect(flagRequiresProvisioning('skip')).toBe(false);
		expect(flagRequiresProvisioning('SKIP')).toBe(false);
	});

	test('any other flag value requires provisioning', () => {
		expect(flagRequiresProvisioning('new')).toBe(true);
		expect(flagRequiresProvisioning('my-db')).toBe(true);
	});
});
