import { z } from 'zod';

/** Basic organization info returned in list endpoints */
export const OrgInfoApiSchema = z.object({
	id: z.string().describe('Organization ID'),
	name: z.string().describe('Organization name'),
});

export type OrgInfo = z.infer<typeof OrgInfoApiSchema>;
