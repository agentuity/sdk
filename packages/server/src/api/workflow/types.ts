import { z } from 'zod';

export const WorkflowSourceTypeSchema = z
	.enum(['email', 'queue', 'webhook', 'schedule'])
	.describe('The type of source that triggers the workflow');

export type WorkflowSourceType = z.infer<typeof WorkflowSourceTypeSchema>;

export const WorkflowStatusSchema = z
	.enum(['enabled', 'disabled'])
	.describe('The status of the workflow');

export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;

export const WorkflowSchema = z
	.object({
		id: z.string().describe('Unique identifier for the workflow (prefixed with wf_)'),
		created_at: z.string().describe('ISO 8601 timestamp when the workflow was created'),
		updated_at: z.string().describe('ISO 8601 timestamp when the workflow was last updated'),
		created_by: z.string().describe('ID of the user who created the workflow'),
		org_id: z.string().describe('Organization ID that owns the workflow'),
		name: z.string().describe('Human-readable name for the workflow'),
		description: z.string().nullable().describe('Optional description of the workflow'),
		source_type: WorkflowSourceTypeSchema.describe(
			'The type of source that triggers this workflow'
		),
		source_ref_id: z
			.string()
			.describe('The ID of the source (email address, queue, webhook, or schedule)'),
		source_config: z
			.record(z.string(), z.unknown())
			.nullable()
			.describe('Optional configuration for the source'),
		status: WorkflowStatusSchema.describe('The current status of the workflow'),
		graph_json: z
			.record(z.string(), z.unknown())
			.nullable()
			.describe('The workflow graph definition (nodes and edges)'),
		execution_count: z
			.number()
			.optional()
			.describe('Number of times this workflow has been executed'),
		link: z.string().optional().describe('Link to the workflow detail page'),
	})
	.describe('Workflow configuration');

export type Workflow = z.infer<typeof WorkflowSchema>;

export const WorkflowExecutionSchema = z
	.object({
		id: z.string().describe('Unique identifier for the execution'),
		workflow_id: z.string().describe('ID of the workflow that was executed'),
		status: z.enum(['pending', 'running', 'completed', 'failed']).describe('Execution status'),
		started_at: z.string().nullable().describe('When the execution started'),
		completed_at: z.string().nullable().describe('When the execution completed'),
		error: z.string().nullable().describe('Error message if the execution failed'),
		steps: z
			.array(
				z.object({
					node_id: z.string(),
					node_type: z.string(),
					status: z.string(),
					started_at: z.string().nullable(),
					completed_at: z.string().nullable(),
					error: z.string().nullable(),
				})
			)
			.optional()
			.describe('Individual step execution details'),
	})
	.describe('Workflow execution record');

export type WorkflowExecution = z.infer<typeof WorkflowExecutionSchema>;

export const WorkflowDeliverySchema = z
	.object({
		id: z.string().describe('Unique identifier for the delivery'),
		workflow_id: z.string().describe('ID of the workflow'),
		execution_id: z.string().describe('ID of the execution this delivery belongs to'),
		destination_type: z.string().describe('Type of destination'),
		destination_id: z.string().describe('ID of the destination'),
		status: z.enum(['pending', 'success', 'failed']).describe('Delivery status'),
		sent_at: z.string().nullable().describe('When the delivery was sent'),
		response: z.unknown().nullable().describe('Response from the destination'),
		error: z.string().nullable().describe('Error message if delivery failed'),
	})
	.describe('Workflow delivery record');

export type WorkflowDelivery = z.infer<typeof WorkflowDeliverySchema>;

export const WorkflowActivitySchema = z
	.object({
		total_workflows: z.number().describe('Total number of workflows'),
		enabled_workflows: z.number().describe('Number of enabled workflows'),
		disabled_workflows: z.number().describe('Number of disabled workflows'),
		total_executions: z.number().describe('Total number of executions'),
		succeeded_executions: z.number().describe('Number of successful executions'),
		failed_executions: z.number().describe('Number of failed executions'),
		last_activity_at: z.string().nullable().describe('When the last activity occurred'),
	})
	.describe('Workflow activity statistics');

export type WorkflowActivity = z.infer<typeof WorkflowActivitySchema>;

export const CreateWorkflowRequestSchema = z
	.object({
		name: z.string().min(1).describe('Human-readable name for the workflow'),
		description: z.string().optional().describe('Optional description of the workflow'),
		source_type: WorkflowSourceTypeSchema.describe(
			'The type of source that triggers this workflow'
		),
		source_ref_id: z.string().describe('The ID of the source'),
		source_config: z
			.record(z.string(), z.unknown())
			.optional()
			.describe('Optional source configuration'),
	})
	.describe('Request for creating a new workflow');

export type CreateWorkflowRequest = z.infer<typeof CreateWorkflowRequestSchema>;

export const UpdateWorkflowRequestSchema = z
	.object({
		name: z.string().min(1).optional().describe('New name for the workflow'),
		description: z.string().nullable().optional().describe('New description for the workflow'),
		status: WorkflowStatusSchema.optional().describe('New status for the workflow'),
	})
	.describe('Request for updating an existing workflow');

export type UpdateWorkflowRequest = z.infer<typeof UpdateWorkflowRequestSchema>;

export const UpdateWorkflowGraphRequestSchema = z
	.object({
		nodes: z
			.array(
				z.object({
					id: z.string(),
					type: z.string().optional(),
					position: z.object({ x: z.number(), y: z.number() }).optional(),
					data: z.unknown().optional(),
				})
			)
			.describe('Array of workflow nodes'),
		edges: z
			.array(
				z.object({
					id: z.string(),
					source: z.string(),
					target: z.string(),
					sourceHandle: z.string().optional(),
					targetHandle: z.string().optional(),
				})
			)
			.describe('Array of workflow edges'),
	})
	.describe('Request for updating the workflow graph');

export type UpdateWorkflowGraphRequest = z.infer<typeof UpdateWorkflowGraphRequestSchema>;

export const TestWorkflowRequestSchema = z
	.object({
		payload: z.unknown().describe('Test payload to send through the workflow'),
	})
	.describe('Request for testing a workflow');

export type TestWorkflowRequest = z.infer<typeof TestWorkflowRequestSchema>;

export const TestWorkflowResultSchema = z
	.object({
		execution_id: z.string().describe('ID of the test execution'),
		status: z.string().describe('Status of the test execution'),
		steps: z
			.array(
				z.object({
					node_id: z.string(),
					node_type: z.string(),
					status: z.string(),
					output: z.unknown().optional(),
					error: z.string().optional(),
				})
			)
			.optional()
			.describe('Individual step results'),
		error: z.string().optional().describe('Error message if test failed'),
	})
	.describe('Result of a workflow test');

export type TestWorkflowResult = z.infer<typeof TestWorkflowResultSchema>;

export const ListWorkflowsRequestSchema = z
	.object({
		limit: z.number().optional().describe('Maximum number of workflows to return'),
		offset: z.number().optional().describe('Number of workflows to skip'),
		status: WorkflowStatusSchema.optional().describe('Filter by status'),
		source_type: WorkflowSourceTypeSchema.optional().describe('Filter by source type'),
		filter: z.string().optional().describe('Filter string for workflows'),
	})
	.describe('Request for listing workflows');

export type ListWorkflowsRequest = z.infer<typeof ListWorkflowsRequestSchema>;

export const WorkflowListResultSchema = z
	.object({
		workflows: z.array(WorkflowSchema).describe('Array of workflows'),
		total: z.number().describe('Total number of workflows'),
	})
	.describe('Result of listing workflows');

export type WorkflowListResult = z.infer<typeof WorkflowListResultSchema>;

export const WorkflowGetResultSchema = z
	.object({
		workflow: WorkflowSchema.describe('The requested workflow'),
	})
	.describe('Result of getting a single workflow');

export type WorkflowGetResult = z.infer<typeof WorkflowGetResultSchema>;

export const WorkflowCreateResultSchema = z
	.object({
		workflow: WorkflowSchema.describe('The newly created workflow'),
	})
	.describe('Result of creating a workflow');

export type WorkflowCreateResult = z.infer<typeof WorkflowCreateResultSchema>;

export const WorkflowUpdateResultSchema = z
	.object({
		workflow: WorkflowSchema.describe('The updated workflow'),
	})
	.describe('Result of updating a workflow');

export type WorkflowUpdateResult = z.infer<typeof WorkflowUpdateResultSchema>;
