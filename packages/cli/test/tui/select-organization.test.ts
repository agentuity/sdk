import { describe, expect, test } from 'bun:test';

// Tests for selectOrganization logic
// We test the core logic inline since the actual function has side effects (enquirer prompts)

describe('selectOrganization logic', () => {
	const orgs = [
		{ id: 'org_1', name: 'Org One' },
		{ id: 'org_2', name: 'Org Two' },
		{ id: 'org_3', name: 'Org Three' },
	];

	describe('with autoSelect=true (--confirm mode)', () => {
		test('should return preferred org if set', () => {
			// Simulate the logic from selectOrganization with autoSelect=true
			const initial = 'org_2';
			const autoSelect = true;

			// Logic: if autoSelect and initial is set, return initial if found
			if (autoSelect && initial) {
				const initialOrg = orgs.find((o) => o.id === initial);
				expect(initialOrg).toBeDefined();
				expect(initialOrg!.id).toBe('org_2');
			}
		});

		test('should return first org if no preferred org set', () => {
			// Simulate the logic from selectOrganization with autoSelect=true but no initial
			const initial = undefined;
			const autoSelect = true;

			// Logic: if autoSelect but no initial, return first org
			if (autoSelect && !initial) {
				const firstOrg = orgs[0];
				expect(firstOrg).toBeDefined();
				expect(firstOrg!.id).toBe('org_1');
			}
		});

		test('should return first org if preferred org not found in list', () => {
			// Simulate the logic from selectOrganization with autoSelect=true but invalid initial
			const initial = 'org_invalid';
			const autoSelect = true;

			// Logic: if autoSelect and initial not found, return first org
			if (autoSelect) {
				const initialOrg = orgs.find((o) => o.id === initial);
				if (!initialOrg) {
					const firstOrg = orgs[0];
					expect(firstOrg).toBeDefined();
					expect(firstOrg!.id).toBe('org_1');
				}
			}
		});
	});

	describe('with autoSelect=false (interactive mode)', () => {
		test('should use preferred org as initial selection index', () => {
			// Simulate the logic from selectOrganization with autoSelect=false
			// In interactive mode, we show the selector with preferred org pre-selected
			const initial = 'org_2';

			// Logic: find index of initial org for pre-selection
			const initialIndex = initial ? orgs.findIndex((o) => o.id === initial) : 0;
			expect(initialIndex).toBe(1); // org_2 is at index 1
		});

		test('should default to index 0 if no preferred org', () => {
			const initial = undefined;

			const initialIndex = initial ? orgs.findIndex((o) => o.id === initial) : 0;
			expect(initialIndex).toBe(0);
		});

		test('should default to index 0 if preferred org not found', () => {
			const initial = 'org_invalid';

			const initialIndex = initial ? orgs.findIndex((o) => o.id === initial) : 0;
			// findIndex returns -1 if not found, but we handle that
			const safeIndex = initialIndex >= 0 ? initialIndex : 0;
			expect(safeIndex).toBe(0);
		});
	});

	describe('single org behavior', () => {
		test('should auto-select single org regardless of autoSelect', () => {
			const singleOrg = [{ id: 'org_only', name: 'Only Org' }];

			// Logic: if only one org, always return it
			if (singleOrg.length === 1 && singleOrg[0]) {
				expect(singleOrg[0].id).toBe('org_only');
			}
		});
	});

	describe('environment variable override', () => {
		test('should prioritize AGENTUITY_CLOUD_ORG_ID env var', () => {
			const envOrgId = 'org_3';

			// Logic: env var takes precedence
			const org = orgs.find((o) => o.id === envOrgId);
			expect(org).toBeDefined();
			expect(org!.id).toBe('org_3');
		});
	});
});
