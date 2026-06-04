import { z } from 'zod';
import { ScheduleSchema, ScheduleDestinationSchema } from './service.ts';

// ============================================================================
// API Response Schemas for Schedule Service
// ============================================================================

/**
 * Response schema for the update-schedule endpoint.
 */
export const ScheduleUpdateResultSchema = z.object({
	/** The updated schedule record */
	schedule: ScheduleSchema.describe('The updated schedule record.'),
});

export type ScheduleUpdateResult = z.infer<typeof ScheduleUpdateResultSchema>;

/**
 * Response schema for the create-schedule-destination endpoint.
 */
export const ScheduleCreateDestinationResultSchema = z.object({
	/** The newly created destination record */
	destination: ScheduleDestinationSchema.describe('The newly created destination record.'),
});

export type ScheduleCreateDestinationResult = z.infer<typeof ScheduleCreateDestinationResultSchema>;
