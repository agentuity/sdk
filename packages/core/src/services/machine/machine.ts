import { z } from 'zod';
import { APIResponseSchema, APIResponseSchemaNoData, type APIClient } from '../api.ts';
import { MachineResponseError } from './util.ts';

// TODO: The old /cli/auth/machine/* endpoints should be aliased to redirect
// to /cli/auth/org/* in the backend (app repo). Remove aliases in follow-up PR.

export const MachineSchema = z
	.object({
		id: z.string().describe('Unique identifier for the machine.'),
		instanceId: z.string().nullable().optional().describe('Cloud provider instance ID.'),
		privateIPv4: z
			.string()
			.nullable()
			.optional()
			.describe('Private IPv4 address of the machine.'),
		availabilityZone: z
			.string()
			.nullable()
			.optional()
			.describe('Cloud provider availability zone.'),
		instanceType: z
			.string()
			.nullable()
			.optional()
			.describe('Cloud provider instance type (e.g., n1-standard-2).'),
		instanceTags: z
			.array(z.string())
			.nullable()
			.optional()
			.describe('Tags assigned to the cloud instance.'),
		deploymentCount: z
			.number()
			.optional()
			.describe('Number of active deployments on this machine.'),
		status: z
			.string()
			.describe('Current status of the machine (e.g., running, stopped, errored).'),
		provider: z.string().describe('Cloud provider (e.g., gcp, aws).'),
		region: z.string().describe('Cloud region where the machine is deployed.'),
		startedAt: z
			.string()
			.nullable()
			.optional()
			.describe('ISO 8601 timestamp when the machine was started.'),
		stoppedAt: z
			.string()
			.nullable()
			.optional()
			.describe('ISO 8601 timestamp when the machine was stopped.'),
		pausedAt: z
			.string()
			.nullable()
			.optional()
			.describe('ISO 8601 timestamp when the machine was paused.'),
		erroredAt: z
			.string()
			.nullable()
			.optional()
			.describe('ISO 8601 timestamp when the machine entered error state.'),
		error: z
			.string()
			.nullable()
			.optional()
			.describe('Error message if the machine is in an error state.'),
		orgId: z.string().nullable().optional().describe('Organization ID that owns this machine.'),
		orgName: z
			.string()
			.nullable()
			.optional()
			.describe('Organization name that owns this machine.'),
		createdAt: z.string().describe('ISO 8601 timestamp when the machine was created.'),
		updatedAt: z
			.string()
			.nullable()
			.optional()
			.describe('ISO 8601 timestamp when the machine was last updated.'),
		metadata: z
			.record(z.string(), z.unknown())
			.nullable()
			.optional()
			.describe('Arbitrary metadata associated with the machine.'),
	})
	.describe('Machine instance in the Agentuity infrastructure.');

export const MachineListResponseSchema = APIResponseSchema(z.array(MachineSchema));
export const MachineGetResponseSchema = APIResponseSchema(MachineSchema);
export const MachineDeleteResponseSchema = APIResponseSchemaNoData();

export type Machine = z.infer<typeof MachineSchema>;

export async function machineList(
	client: APIClient,
	options?: { orgId?: string }
): Promise<Machine[]> {
	const headers = options?.orgId ? { 'x-agentuity-orgid': options.orgId } : undefined;
	const resp = await client.get('/machine', MachineListResponseSchema, undefined, headers);
	if (resp.success) {
		return resp.data;
	}
	throw new MachineResponseError({ message: resp.message });
}

export async function machineGet(client: APIClient, machineId: string): Promise<Machine> {
	const resp = await client.get(`/machine/${machineId}`, MachineGetResponseSchema);
	if (resp.success) {
		return resp.data;
	}
	throw new MachineResponseError({ message: resp.message });
}

export async function machineDelete(client: APIClient, machineId: string): Promise<void> {
	const resp = await client.delete(`/machine/${machineId}`, MachineDeleteResponseSchema);
	if (!resp.success) {
		throw new MachineResponseError({ message: resp.message });
	}
}

export const MachineDeploymentProjectSchema = z
	.object({
		id: z.string().describe('Unique identifier for the project.'),
		name: z.string().describe('Human-readable project name.'),
		identifier: z.string().describe('URL-safe project identifier.'),
		domains: z.array(z.string()).describe('Custom domains assigned to this project.'),
	})
	.describe('Project associated with a machine deployment.');

export type MachineDeploymentProject = z.infer<typeof MachineDeploymentProjectSchema>;

export const MachineDeploymentResourcesSchema = z
	.object({
		cpuUnits: z.number().describe('CPU units allocated to the deployment.'),
		memoryUnits: z.number().describe('Memory units allocated to the deployment.'),
		diskUnits: z.number().describe('Disk units allocated to the deployment.'),
	})
	.describe('Resource allocation for a machine deployment.');

export type MachineDeploymentResources = z.infer<typeof MachineDeploymentResourcesSchema>;

export const MachineDeploymentSchema = z
	.object({
		id: z.string().describe('Unique identifier for the deployment.'),
		identifier: z.string().optional().describe('URL-safe deployment identifier.'),
		state: z.string().optional().describe('Current state of the deployment.'),
		project: MachineDeploymentProjectSchema.nullable()
			.optional()
			.describe('Project associated with this deployment.'),
		resources: MachineDeploymentResourcesSchema.nullable()
			.optional()
			.describe('Resource allocation for this deployment.'),
		customDomains: z.array(z.string()).describe('Custom domains configured for this deployment.'),
		paused: z.boolean().describe('Whether the deployment is currently paused.'),
		pausedDuration: z.number().describe('Duration in seconds the deployment has been paused.'),
		domainSuffix: z.string().describe('Domain suffix for the deployment URL.'),
	})
	.describe('Deployment running on a machine.');

export const MachineDeploymentsResponseSchema = APIResponseSchema(z.array(MachineDeploymentSchema));

export type MachineDeployment = z.infer<typeof MachineDeploymentSchema>;

export async function machineDeployments(
	client: APIClient,
	machineId: string
): Promise<MachineDeployment[]> {
	const resp = await client.get(
		`/machine/deployments/${machineId}`,
		MachineDeploymentsResponseSchema
	);
	if (resp.success) {
		return resp.data;
	}
	throw new MachineResponseError({ message: resp.message });
}

export const OrgAuthEnrollResponseSchema = APIResponseSchema(
	z.object({
		orgId: z.string().describe('Organization ID that was enrolled.'),
	})
);

export async function orgAuthEnroll(
	client: APIClient,
	orgId: string,
	publicKey: string
): Promise<{ orgId: string }> {
	const resp = await client.post(
		'/cli/auth/org/enroll',
		{ orgId, publicKey },
		OrgAuthEnrollResponseSchema
	);
	if (resp.success) {
		return resp.data;
	}
	throw new MachineResponseError({ message: resp.message });
}

export const OrgAuthStatusResponseSchema = APIResponseSchema(
	z.object({
		publicKey: z
			.string()
			.nullable()
			.describe('Public key for the organization, or null if not enrolled.'),
	})
);

export async function orgAuthStatus(
	client: APIClient,
	orgId: string
): Promise<{ publicKey: string | null }> {
	const resp = await client.get(`/cli/auth/org/status/${orgId}`, OrgAuthStatusResponseSchema);
	if (resp.success) {
		return resp.data;
	}
	throw new MachineResponseError({ message: resp.message });
}

export const OrgAuthUnenrollResponseSchema = APIResponseSchemaNoData();

export async function orgAuthUnenroll(client: APIClient, orgId: string): Promise<void> {
	const resp = await client.delete(
		`/cli/auth/org/unenroll/${orgId}`,
		OrgAuthUnenrollResponseSchema
	);
	if (!resp.success) {
		throw new MachineResponseError({ message: resp.message });
	}
}
