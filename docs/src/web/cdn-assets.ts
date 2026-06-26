import type { TransformAssetsObjectShorthand } from '@tanstack/react-start/server';

// Trim whitespace and trailing slashes; empty -> undefined. Applied to both env
// values so the deployment-id fallback can't produce a `//assets` double slash.
function cleanEnvValue(value: string | undefined): string | undefined {
	const trimmed = value?.trim().replace(/\/+$/, '');
	return trimmed ? trimmed : undefined;
}

export function createDocsCdnTransformAssets(
	env: NodeJS.ProcessEnv = process.env
): TransformAssetsObjectShorthand | undefined {
	const cdnOrigin = cleanEnvValue(env.AGENTUITY_CDN_ORIGIN);
	if (cdnOrigin) {
		return { prefix: cdnOrigin, crossOrigin: 'anonymous' };
	}

	const deploymentId = cleanEnvValue(env.AGENTUITY_CLOUD_DEPLOYMENT_ID);
	if (!deploymentId) {
		return undefined;
	}

	return {
		prefix: `https://cdn.agentuity.com/${deploymentId}`,
		crossOrigin: 'anonymous',
	};
}
