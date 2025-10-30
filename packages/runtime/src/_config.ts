let appName: string | undefined;
let appVersion: string | undefined;

(async () => {
	const f = Bun.file('./package.json');
	if (await f.exists()) {
		const pkg = JSON.parse(await f.text());
		appName = pkg.name;
		appVersion = pkg.version;
	}
})();

/**
 * Returns the SDK Version that was used to build this app
 *
 * @returns string
 */
export function getSDKVersion(): string {
	return process.env.AGENTUITY_CLOUD_SDK_VERSION ?? 'unknown';
}

/**
 * Returns the App Name that was used when this app was built
 *
 * @returns string
 */
export function getAppName(): string {
	return appName ?? 'unknown';
}

/**
 * Returns the App Version that was used when this app was built
 *
 * @returns string
 */
export function getAppVersion(): string {
	return appVersion ?? 'unknown';
}

/**
 * Returns the Organization ID for this app
 *
 * @returns string
 */
export function getOrganizationId(): string | undefined {
	return process.env.AGENTUITY_CLOUD_ORG_ID;
}

/**
 * Returns the Project ID for this app
 *
 * @returns string
 */
export function getProjectId(): string | undefined {
	return process.env.AGENTUITY_CLOUD_PROJECT_ID;
}

/**
 * Returns the Deployment ID for this app that was deployed
 *
 * @returns string | undefined
 */
export function getDeploymentId(): string | undefined {
	return process.env.AGENTUITY_CLOUD_DEPLOYMENT_ID;
}

/**
 * Returns true if the app is running in dev mode
 *
 * @returns boolean
 */
export function isDevMode(): boolean {
	return process.env.AGENTUITY_SDK_DEV_MODE === 'true';
}

/**
 * Returns true if the app is running in production mode
 *
 * @returns boolean
 */
export function isProduction(): boolean {
	return process.env.NODE_ENV === 'production';
}

/**
 * Returns the CLI version that was used when this app was built
 *
 * @returns string
 */
export function getCLIVersion(): string {
	return process.env.AGENTUITY_CLI_VERSION ?? 'unknown';
}

/**
 * Returns the environment setting for this app
 *
 * @returns string
 */
export function getEnvironment(): string {
	return process.env.AGENTUITY_ENVIRONMENT || process.env.NODE_ENV || 'development';
}

/**
 * Returns true if the AGENTUITY_SDK_KEY is set
 *
 * @returns boolean
 */
export function isAuthenticated(): boolean {
	return !!process.env.AGENTUITY_SDK_KEY;
}
