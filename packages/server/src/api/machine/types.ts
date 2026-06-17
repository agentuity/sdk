import { z } from 'zod';

/** Request payload for enrolling an organization */
export const OrgAuthEnrollRequestSchema = z.object({
	orgId: z.string().describe('Organization ID'),
	publicKey: z.string().describe('Public key for machine authentication'),
});

/** Response data from enrolling an organization */
export const OrgAuthEnrollDataSchema = z.object({
	orgId: z.string().describe('The enrolled organization ID'),
});

/** Response data from getting enrollment status */
export const OrgAuthStatusDataSchema = z.object({
	publicKey: z.string().nullable().describe('Public key or null if not enrolled'),
});

export type OrgAuthEnrollRequest = z.infer<typeof OrgAuthEnrollRequestSchema>;
export type OrgAuthEnrollData = z.infer<typeof OrgAuthEnrollDataSchema>;
export type OrgAuthStatusData = z.infer<typeof OrgAuthStatusDataSchema>;
