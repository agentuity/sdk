import { z } from 'zod';
import { APIResponseSchema, APIResponseSchemaNoData, APIClient } from '../api';
import { MachineResponseError } from './util';

// TODO: The old /cli/auth/machine/* endpoints should be aliased to redirect
// to /cli/auth/org/* in the backend (app repo). Remove aliases in follow-up PR.

const MachineSchema = z.object({
	id: z.string(),
	instanceId: z.string().nullable().optional(),
	privateIPv4: z.string().nullable().optional(),
	availabilityZone: z.string().nullable().optional(),
	instanceType: z.string().nullable().optional(),
	instanceTags: z.array(z.string()).nullable().optional(),
	deploymentCount: z.number().optional(),
	status: z.string(),
	provider: z.string(),
	region: z.string(),
	startedAt: z.string().nullable().optional(),
	stoppedAt: z.string().nullable().optional(),
	pausedAt: z.string().nullable().optional(),
	erroredAt: z.string().nullable().optional(),
	error: z.string().nullable().optional(),
	orgId: z.string().nullable().optional(),
	orgName: z.string().nullable().optional(),
	createdAt: z.string(),
	updatedAt: z.string().nullable().optional(),
	metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

const MachineListResponseSchema = APIResponseSchema(z.array(MachineSchema));
const MachineGetResponseSchema = APIResponseSchema(MachineSchema);
const MachineDeleteResponseSchema = APIResponseSchemaNoData();

export type Machine = z.infer<typeof MachineSchema>;

export async function machineList(client: APIClient): Promise<Machine[]> {
	const resp = await client.get('/machine', MachineListResponseSchema);
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

const MachineDeploymentProjectSchema = z.object({
	id: z.string(),
	name: z.string(),
	identifier: z.string(),
	domains: z.array(z.string()),
});

const MachineDeploymentResourcesSchema = z.object({
	cpuUnits: z.number(),
	memoryUnits: z.number(),
	diskUnits: z.number(),
});

const MachineDeploymentSchema = z.object({
	id: z.string(),
	identifier: z.string().optional(),
	state: z.string().optional(),
	project: MachineDeploymentProjectSchema.nullable().optional(),
	resources: MachineDeploymentResourcesSchema.nullable().optional(),
	customDomains: z.array(z.string()),
	paused: z.boolean(),
	pausedDuration: z.number(),
	domainSuffix: z.string(),
});

const MachineDeploymentsResponseSchema = APIResponseSchema(z.array(MachineDeploymentSchema));

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

const OrgAuthEnrollResponseSchema = APIResponseSchema(
	z.object({
		orgId: z.string(),
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

const OrgAuthStatusResponseSchema = APIResponseSchema(
	z.object({
		publicKey: z.string().nullable(),
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

const OrgAuthUnenrollResponseSchema = APIResponseSchemaNoData();

export async function orgAuthUnenroll(client: APIClient, orgId: string): Promise<void> {
	const resp = await client.delete(
		`/cli/auth/org/unenroll/${orgId}`,
		OrgAuthUnenrollResponseSchema
	);
	if (!resp.success) {
		throw new MachineResponseError({ message: resp.message });
	}
}
