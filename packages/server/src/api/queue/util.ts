import { StructuredError } from '@agentuity/core';
import { APIError } from '../api.ts';

/**
 * General queue operation error.
 *
 * Thrown when a queue operation fails for reasons other than not-found or validation.
 *
 * @example
 * ```typescript
 * try {
 *   await createQueue(client, { queue_type: 'worker' });
 * } catch (error) {
 *   if (error instanceof QueueError) {
 *     console.error(`Queue operation failed: ${error.message}`);
 *   }
 * }
 * ```
 */
export const QueueError = StructuredError('QueueError')<{ queueName?: string }>();

/**
 * Error thrown when a queue is not found.
 *
 * @example
 * ```typescript
 * try {
 *   await getQueue(client, 'non-existent-queue');
 * } catch (error) {
 *   if (error instanceof QueueNotFoundError) {
 *     console.error(`Queue not found: ${error.queueName}`);
 *   }
 * }
 * ```
 */
export const QueueNotFoundError = StructuredError('QueueNotFoundError')<{ queueName: string }>();

/**
 * Error thrown when a message is not found in a queue.
 *
 * @example
 * ```typescript
 * try {
 *   await getMessage(client, 'my-queue', 'msg_abc123');
 * } catch (error) {
 *   if (error instanceof MessageNotFoundError) {
 *     console.error(`Message ${error.messageId} not found in ${error.queueName}`);
 *   }
 * }
 * ```
 */
export const MessageNotFoundError = StructuredError('MessageNotFoundError')<{
	queueName: string;
	messageId: string;
}>();

/**
 * Error thrown when a destination is not found.
 *
 * @example
 * ```typescript
 * try {
 *   await deleteDestination(client, 'my-queue', 'dest_abc123');
 * } catch (error) {
 *   if (error instanceof DestinationNotFoundError) {
 *     console.error(`Destination ${error.destinationId} not found`);
 *   }
 * }
 * ```
 */
export const DestinationNotFoundError = StructuredError('DestinationNotFoundError')<{
	queueName: string;
	destinationId: string;
}>();

/**
 * Error thrown when a destination with the same type and URL already exists.
 *
 * @example
 * ```typescript
 * try {
 *   await createDestination(client, 'my-queue', { url: 'https://example.com' });
 * } catch (error) {
 *   if (error instanceof DestinationAlreadyExistsError) {
 *     console.error(`Destination already exists: ${error.url}`);
 *   }
 * }
 * ```
 */
export const DestinationAlreadyExistsError = StructuredError('DestinationAlreadyExistsError')<{
	queueName: string;
	url?: string;
}>();

/**
 * Error thrown when an invalid argument is provided to a queue operation.
 *
 * @example
 * ```typescript
 * try {
 *   await createQueue(client, { queue_type: 'invalid' as any });
 * } catch (error) {
 *   if (error instanceof QueueInvalidArgumentError) {
 *     console.error(`Invalid parameter: ${error.param}`);
 *   }
 * }
 * ```
 */
export const QueueInvalidArgumentError = StructuredError('QueueInvalidArgumentError')<{
	queueName?: string;
	param?: string;
}>();

/**
 * Error thrown when a source is not found.
 *
 * @example
 * ```typescript
 * try {
 *   await getSource(client, 'my-queue', 'qsrc_abc123');
 * } catch (error) {
 *   if (error instanceof SourceNotFoundError) {
 *     console.error(`Source ${error.sourceId} not found in ${error.queueName}`);
 *   }
 * }
 * ```
 */
export const SourceNotFoundError = StructuredError('SourceNotFoundError')<{
	queueName: string;
	sourceId: string;
}>();

/**
 * Error thrown when a source with the same name already exists.
 *
 * @example
 * ```typescript
 * try {
 *   await createSource(client, 'my-queue', { name: 'existing-source' });
 * } catch (error) {
 *   if (error instanceof SourceAlreadyExistsError) {
 *     console.error(`Source "${error.name}" already exists in ${error.queueName}`);
 *   }
 * }
 * ```
 */
export const SourceAlreadyExistsError = StructuredError('SourceAlreadyExistsError')<{
	queueName: string;
	name: string;
}>();

/** Current Queue API version. */
const QUEUE_API_VERSION = '2026-01-15';

/**
 * Constructs a full API path for queue operations.
 * New pattern: /queue/[action]/$VERSION/[args]
 *
 * @param action - The action/resource (e.g., 'create', 'list', 'get', 'messages/publish')
 * @param args - Optional path arguments (e.g., queue name, message id)
 * @returns The full API path with version prefix
 *
 * @internal
 */
export function queueApiPath(action: string, ...args: string[]): string {
	const encodedArgs = args.map((arg) => encodeURIComponent(arg)).join('/');
	if (encodedArgs) {
		return `/queue/${action}/${QUEUE_API_VERSION}/${encodedArgs}`;
	}
	return `/queue/${action}/${QUEUE_API_VERSION}`;
}

/**
 * Constructs a full API path for queue operations with query string.
 *
 * @param action - The action/resource
 * @param queryString - Query string to append (without leading ?)
 * @param args - Optional path arguments
 * @returns The full API path with version prefix and query string
 *
 * @internal
 */
export function queueApiPathWithQuery(
	action: string,
	queryString: string | undefined,
	...args: string[]
): string {
	const basePath = queueApiPath(action, ...args);
	return queryString ? `${basePath}?${queryString}` : basePath;
}

/**
 * Builds headers for queue API requests.
 *
 * @param orgId - Optional organization ID for CLI authentication
 * @returns Headers object to pass to API client
 *
 * @internal
 */
export function buildQueueHeaders(orgId?: string): Record<string, string> | undefined {
	if (orgId) {
		return { 'x-agentuity-orgid': orgId };
	}
	return undefined;
}

/**
 * Wraps an API call and translates APIError with HTTP status codes to domain-specific queue errors.
 *
 * - 404 → QueueNotFoundError / MessageNotFoundError / DestinationNotFoundError / SourceNotFoundError
 * - 409 with "already exists" → DestinationAlreadyExistsError / SourceAlreadyExistsError
 *
 * @internal
 */
export async function withQueueErrorHandling<T>(
	apiCall: () => Promise<T>,
	context: {
		queueName?: string;
		messageId?: string;
		destinationId?: string;
		sourceId?: string;
		sourceName?: string;
		destinationUrl?: string;
	}
): Promise<T> {
	try {
		return await apiCall();
	} catch (error) {
		if (error instanceof APIError) {
			if (error.status === 404) {
				if (context.messageId && context.queueName) {
					throw new MessageNotFoundError({
						queueName: context.queueName,
						messageId: context.messageId,
						message: error.message,
					});
				}
				if (context.destinationId && context.queueName) {
					throw new DestinationNotFoundError({
						queueName: context.queueName,
						destinationId: context.destinationId,
						message: error.message,
					});
				}
				if (context.sourceId && context.queueName) {
					throw new SourceNotFoundError({
						queueName: context.queueName,
						sourceId: context.sourceId,
						message: error.message,
					});
				}
				if (context.queueName) {
					throw new QueueNotFoundError({
						queueName: context.queueName,
						message: error.message,
					});
				}
			}
			if (error.status === 409) {
				if (context.destinationUrl && context.queueName) {
					throw new DestinationAlreadyExistsError({
						queueName: context.queueName,
						url: context.destinationUrl,
						message: error.message,
					});
				}
				if (context.sourceName && context.queueName) {
					throw new SourceAlreadyExistsError({
						queueName: context.queueName,
						name: context.sourceName,
						message: error.message,
					});
				}
			}
		}
		throw error;
	}
}
