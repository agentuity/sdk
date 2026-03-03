import type { APIClient } from '../../../api';
import type { Config } from '../../../types';
import * as tui from '../../../tui';
import { listOrganizations } from '@agentuity/server';

/**
 * Resolves the organization ID for org-scoped env operations.
 *
 * @param apiClient - The API client
 * @param config - The CLI config (may be null)
 * @param orgOption - The --org option value (true for default/prompt, or explicit org ID)
 * @param autoSelect - If true, auto-select preferred org without prompting (for --confirm)
 * @returns The resolved organization ID
 */
export async function resolveOrgId(
	apiClient: APIClient,
	config: Config | null,
	orgOption: boolean | string,
	autoSelect?: boolean
): Promise<string> {
	// If an explicit org ID was provided (string), use it directly
	if (typeof orgOption === 'string' && orgOption !== 'true') {
		return orgOption;
	}

	// Otherwise, we need to select an org
	const orgs = await tui.spinner('Fetching organizations', () => listOrganizations(apiClient));

	// Use preference if available, otherwise prompt
	// Pass autoSelect to skip prompting when --confirm is used
	const preferredOrgId = config?.preferences?.orgId;
	return tui.selectOrganization(orgs, preferredOrgId, autoSelect);
}

/**
 * Checks if we're operating in org scope based on the --org option.
 */
export function isOrgScope(orgOption: boolean | string | undefined): boolean {
	return orgOption === true || (typeof orgOption === 'string' && orgOption.length > 0);
}
