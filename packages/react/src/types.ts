import type { StandardSchemaV1 } from '@agentuity/core';

/**
 * Agent definition interface
 */
export interface Agent<
	TInput extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
	TOutput extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
> {
	inputSchema: TInput;
	outputSchema: TOutput;
}

/**
 * Registry of all agents in the project.
 * This interface is designed to be augmented by generated code in the user's project.
 *
 * Example usage in generated code (.agentuity/types.d.ts):
 * ```typescript
 * import type { Agent } from '@agentuity/react';
 * import type { MyInputSchema, MyOutputSchema } from './schemas';
 *
 * declare module '@agentuity/react' {
 *   interface AgentRegistry {
 *     'my-agent': Agent<MyInputSchema, MyOutputSchema>;
 *     'another-agent': Agent<AnotherInput, AnotherOutput>;
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AgentRegistry {}

/**
 * Union type of all registered agent names.
 * Falls back to `string` when AgentRegistry is empty (before augmentation).
 * After augmentation, this becomes a strict union of agent names for full type safety.
 */
export type AgentName = keyof AgentRegistry extends never ? string : keyof AgentRegistry;
