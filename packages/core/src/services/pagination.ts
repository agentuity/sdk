import { z } from 'zod';

/** Sort direction for list operations */
export const SortDirectionSchema = z
	.enum(['asc', 'desc'])
	.describe('Sort direction for list operations (ascending or descending).');

export type SortDirection = z.infer<typeof SortDirectionSchema>;

/** Base pagination parameters used by all list operations */
export const PaginationParamsSchema = z.object({
	limit: z.number().optional().describe('Maximum number of items to return'),
	offset: z.number().optional().describe('Number of items to skip for pagination'),
});

export type PaginationParams = z.infer<typeof PaginationParamsSchema>;

/** Sort parameters generic over allowed field names */
export const SortParamsSchema = <F extends z.ZodTypeAny>(sortFieldSchema: F) =>
	z.object({
		sort: sortFieldSchema.optional().describe('Field to sort by'),
		direction: SortDirectionSchema.optional().describe("Sort direction (default: 'desc')"),
	});

export type SortParams<F extends string = string> = {
	/** Field to sort by */
	sort?: F;
	/** Sort direction (default: 'desc') */
	direction?: SortDirection;
};

/** Combined list parameters = pagination + sorting */
export const ListParamsSchema = <F extends z.ZodTypeAny>(sortFieldSchema: F) =>
	PaginationParamsSchema.merge(SortParamsSchema(sortFieldSchema));

export type ListParams<F extends string = string> = PaginationParams & SortParams<F>;

/** Standard paginated list response */
export const PaginatedListSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
	z.object({
		data: z.array(itemSchema).describe('Array of items'),
		total: z.number().describe('Total number of items matching the query'),
		limit: z.number().describe('Number of items requested per page'),
		offset: z.number().describe('Number of items skipped'),
		hasMore: z.boolean().describe('Whether more items are available'),
	});

export type PaginatedList<T> = {
	/** Array of items */
	data: T[];
	/** Total number of items matching the query */
	total: number;
	/** Number of items requested per page */
	limit: number;
	/** Number of items skipped */
	offset: number;
	/** Whether more items are available */
	hasMore: boolean;
};
