/** Sort direction for list operations */
export type SortDirection = 'asc' | 'desc';

/** Base pagination parameters used by all list operations */
export interface PaginationParams {
	/** Maximum number of items to return */
	limit?: number;
	/** Number of items to skip for pagination */
	offset?: number;
}

/** Sort parameters generic over allowed field names */
export interface SortParams<F extends string = string> {
	/** Field to sort by */
	sort?: F;
	/** Sort direction (default: 'desc') */
	direction?: SortDirection;
}

/** Combined list parameters = pagination + sorting */
export type ListParams<F extends string = string> = PaginationParams & SortParams<F>;

/** Standard paginated list response */
export interface PaginatedList<T> {
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
}
