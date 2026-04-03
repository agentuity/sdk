import type { CoderClient, CoderSessionRepositoryRef } from '@agentuity/core/coder';

/**
 * Parse a GitHub reference string into owner/repo/branch.
 * Accepts:
 *   - github.com/owner/repo
 *   - https://github.com/owner/repo
 *   - https://github.com/owner/repo.git
 *   - owner/repo
 *   - owner/repo#branch
 *   - https://github.com/owner/repo/tree/branch
 */
export function parseGitHubRef(
	input: string
): { owner: string; repo: string; branch?: string } | null {
	let clean = input.trim();

	// Handle owner/repo#branch
	let branch: string | undefined;
	const hashIdx = clean.indexOf('#');
	if (hashIdx > 0) {
		branch = clean.slice(hashIdx + 1);
		clean = clean.slice(0, hashIdx);
	}

	// Handle URLs
	if (clean.includes('github.com')) {
		try {
			const url = new URL(clean.startsWith('http') ? clean : `https://${clean}`);
			const parts = url.pathname
				.replace(/^\//, '')
				.replace(/\.git$/, '')
				.split('/');
			const owner = parts[0];
			const repo = parts[1];
			if (parts.length >= 2 && owner && repo) {
				// Handle /tree/branch paths
				if (parts.length >= 4 && parts[2] === 'tree') {
					branch = branch || parts.slice(3).join('/');
				}
				return { owner, repo, branch };
			}
		} catch {
			// fall through
		}
	}

	// Handle owner/repo
	const slashParts = clean.replace(/\.git$/, '').split('/');
	if (slashParts.length === 2 && slashParts[0] && slashParts[1]) {
		return { owner: slashParts[0], repo: slashParts[1], branch };
	}

	return null;
}

/**
 * Resolve a GitHub reference to a full repository ref by calling the Hub's GitHub APIs.
 *
 * Flow:
 * 1. Parse the input to get owner/repo
 * 2. List GitHub accounts → find the one matching the owner
 * 3. List repos for that account → find the matching repo
 * 4. Build full CoderSessionRepositoryRef with all metadata
 */
export async function resolveGitHubRepo(
	client: CoderClient,
	input: string,
	branchOverride?: string
): Promise<CoderSessionRepositoryRef> {
	const parsed = parseGitHubRef(input);
	if (!parsed) {
		throw new Error(`Could not parse GitHub reference: ${input}`);
	}

	const { owner, repo, branch: parsedBranch } = parsed;
	const branch = branchOverride || parsedBranch;

	// Step 1: List GitHub accounts
	const accountsResponse = await client.listGitHubAccounts();
	if (!accountsResponse.connected) {
		throw new Error('GitHub is not connected. Please connect GitHub via the Coder web UI first.');
	}

	const account = accountsResponse.accounts.find(
		(a) => a.accountName.toLowerCase() === owner.toLowerCase()
	);
	if (!account) {
		const available = accountsResponse.accounts.map((a) => a.accountName).join(', ');
		throw new Error(
			`GitHub account "${owner}" not found. Available accounts: ${available || 'none'}`
		);
	}

	// Step 2: List repos for that account
	const reposResponse = await client.listGitHubRepos(account.accountId);
	const repoMatch = reposResponse.repositories.find(
		(r) => r.name.toLowerCase() === repo.toLowerCase()
	);
	if (!repoMatch) {
		throw new Error(`Repository "${repo}" not found in GitHub account "${owner}".`);
	}

	// Step 3: Build full repo ref
	return {
		url: repoMatch.cloneUrl,
		branch: branch || repoMatch.defaultBranch,
		provider: 'github',
		name: repoMatch.name,
		fullName: repoMatch.fullName,
		defaultBranch: repoMatch.defaultBranch,
		private: repoMatch.private,
		htmlUrl: repoMatch.htmlUrl,
		accountId: account.accountId,
		accountName: account.accountName,
		accountType: account.accountType,
		accountAvatarUrl: account.avatarUrl,
	} as CoderSessionRepositoryRef;
}
