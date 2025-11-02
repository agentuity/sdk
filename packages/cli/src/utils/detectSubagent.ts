/**
 * Detects if a file path represents a subagent based on path structure.
 *
 * Subagents follow the pattern: agents/parent/child/agent.ts or agents/parent/child/route.ts
 * The path structure is currently hardcoded to 4 segments but could be made configurable later.
 *
 * @param filePath - The file path to analyze (can include leading './')
 * @param srcDir - Optional source directory to strip from the path
 * @returns Object with isSubagent flag and parentName if detected
 */
export function detectSubagent(
	filePath: string,
	srcDir?: string
): { isSubagent: boolean; parentName: string | null } {
	let normalizedPath = filePath;

	// Strip srcDir if provided
	if (srcDir && normalizedPath.startsWith(srcDir)) {
		normalizedPath = normalizedPath.replace(srcDir, '');
	}

	// Strip leading './' and split into parts, filtering out empty segments
	const pathParts = normalizedPath.replace(/^\.\//, '').split('/').filter(Boolean);

	// Path structure assumption: ['agents', 'parent', 'child', 'agent.ts' | 'route.ts' | 'route']
	// Currently hardcoded to 4 segments - consider making configurable in the future
	const isSubagent = pathParts.length === 4 && pathParts[0] === 'agents';
	const parentName = isSubagent ? pathParts[1] : null;

	return { isSubagent, parentName };
}
