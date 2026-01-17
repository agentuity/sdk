import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { getCommand } from '../../../../command-prefix';
import { snapshotGet, sandboxList } from '@agentuity/server';
import type { SnapshotFileInfo } from '@agentuity/server';
import type { SandboxInfo } from '@agentuity/core';
import { getGlobalCatalystAPIClient } from '../../../../config';

const SnapshotFileSchema = z.object({
	path: z.string(),
	size: z.number(),
	sha256: z.string(),
	contentType: z.string(),
	mode: z.number(),
});

const SandboxInfoSchema = z.object({
	sandboxId: z.string().describe('Sandbox ID'),
	status: z.string().describe('Current status'),
	createdAt: z.string().describe('Creation timestamp'),
	executions: z.number().describe('Number of executions'),
});

const SnapshotGetResponseSchema = z.object({
	snapshotId: z.string().describe('Snapshot ID'),
	name: z.string().describe('Snapshot name'),
	fullName: z.string().optional().describe('Full name with org slug (@slug/name:tag)'),
	tag: z.string().nullable().optional().describe('Snapshot tag'),
	sizeBytes: z.number().describe('Snapshot size in bytes'),
	fileCount: z.number().describe('Number of files'),
	parentSnapshotId: z.string().nullable().optional().describe('Parent snapshot ID'),
	public: z.boolean().optional().describe('Whether snapshot is publicly accessible'),
	orgName: z.string().optional().describe('Organization name (for public snapshots)'),
	orgSlug: z.string().optional().describe('Organization slug (for public snapshots)'),
	createdAt: z.string().describe('Creation timestamp'),
	downloadUrl: z.string().optional().describe('Presigned download URL'),
	files: z.array(SnapshotFileSchema).nullable().optional().describe('Files in snapshot'),
	userMetadata: z
		.record(z.string(), z.string())
		.nullable()
		.optional()
		.describe('User-defined metadata'),
	sandboxes: z
		.array(SandboxInfoSchema)
		.optional()
		.describe('Attached sandboxes (idle or running)'),
});

export const getSubcommand = createCommand({
	name: 'get',
	aliases: ['info', 'show'],
	description: 'Get snapshot details',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('cloud sandbox snapshot get snp_abc123'),
			description: 'Get details for a snapshot',
		},
	],
	schema: {
		args: z.object({
			snapshotId: z.string().describe('Snapshot ID'),
		}),
		response: SnapshotGetResponseSchema,
	},

	async handler(ctx) {
		const { args, options, auth, logger, orgId, config } = ctx;
		const client = await getGlobalCatalystAPIClient(logger, auth, config?.name);

		const snapshot = await snapshotGet(client, {
			snapshotId: args.snapshotId,
			orgId,
		});

		const sandboxesResult = await sandboxList(client, {
			orgId,
			snapshotId: args.snapshotId,
		});

		const activeSandboxes = sandboxesResult.sandboxes.filter(
			(s) => s.status === 'idle' || s.status === 'running'
		);

		if (!options.json) {
			const tableData: Record<string, string | number> = {
				Snapshot: tui.bold(snapshot.snapshotId),
				Name: snapshot.name,
			};
			if (snapshot.tag) {
				tableData['Tag'] = snapshot.tag;
			}
			tableData['Size'] = tui.formatBytes(snapshot.sizeBytes);
			tableData['Files'] = snapshot.fileCount;
			if (snapshot.public) {
				tableData['Public'] = 'Yes';
				if (snapshot.fullName) {
					tableData['Full Name'] = snapshot.fullName;
				}
				if (snapshot.orgName) {
					tableData['Publisher'] = snapshot.orgName;
				}
			}
			tableData['Created'] = snapshot.createdAt;
			if (snapshot.parentSnapshotId) {
				tableData['Parent'] = snapshot.parentSnapshotId;
			}

			tui.table([tableData], Object.keys(tableData), { layout: 'vertical', padStart: '  ' });

			if (
				snapshot.userMetadata &&
				typeof snapshot.userMetadata === 'object' &&
				Object.keys(snapshot.userMetadata).length > 0
			) {
				console.log('');
				tui.info('Metadata:');
				for (const [key, value] of Object.entries(snapshot.userMetadata)) {
					console.log(`  ${tui.muted('•')} ${key}=${value}`);
				}
			}

			if (snapshot.files && snapshot.files.length > 0) {
				console.log('');
				tui.info('Files:');
				printFileTree(snapshot.files);
			}

			if (activeSandboxes.length > 0) {
				console.log('');
				tui.info(`Attached Sandboxes (${activeSandboxes.length}):`);
				printSandboxTree(activeSandboxes);
			}
		}

		return {
			...snapshot,
			sandboxes: activeSandboxes.map((s) => ({
				sandboxId: s.sandboxId,
				status: s.status,
				createdAt: s.createdAt,
				executions: s.executions,
			})),
		};
	},
});

interface TreeNode {
	name: string;
	size?: number;
	isFile: boolean;
	children: Map<string, TreeNode>;
}

function buildFileTree(files: SnapshotFileInfo[]): TreeNode {
	const root: TreeNode = { name: '', isFile: false, children: new Map() };

	for (const file of files) {
		const parts = file.path.split('/');
		let current = root;

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			if (!current.children.has(part)) {
				current.children.set(part, {
					name: part,
					isFile: i === parts.length - 1,
					children: new Map(),
				});
			}
			current = current.children.get(part)!;

			if (i === parts.length - 1) {
				current.size = file.size;
				current.isFile = true;
			}
		}
	}

	return root;
}

function printFileTree(files: SnapshotFileInfo[]): void {
	const tree = buildFileTree(files);
	printTreeNode(tree, '  ');
}

function printTreeNode(node: TreeNode, prefix: string): void {
	const entries = Array.from(node.children.entries()).sort((a, b) => {
		const aIsDir = !a[1].isFile;
		const bIsDir = !b[1].isFile;
		if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
		return a[0].localeCompare(b[0]);
	});

	for (let i = 0; i < entries.length; i++) {
		const [, child] = entries[i];
		const isLast = i === entries.length - 1;
		const connector = tui.muted(isLast ? '└── ' : '├── ');
		const sizeStr =
			child.isFile && child.size !== undefined ? ` (${tui.formatBytes(child.size)})` : '';

		console.log(`${prefix}${connector}${child.name}${sizeStr}`);

		if (child.children.size > 0) {
			const newPrefix = prefix + (isLast ? '    ' : tui.muted('│   '));
			printTreeNode(child, newPrefix);
		}
	}
}

function printSandboxTree(sandboxes: SandboxInfo[]): void {
	const sorted = [...sandboxes].sort((a, b) => a.sandboxId.localeCompare(b.sandboxId));
	for (let i = 0; i < sorted.length; i++) {
		const sandbox = sorted[i];
		const isLast = i === sorted.length - 1;
		const connector = tui.muted(isLast ? '└── ' : '├── ');
		const statusColor = sandbox.status === 'running' ? tui.success : tui.muted;
		console.log(`  ${connector}${sandbox.sandboxId} ${statusColor(`(${sandbox.status})`)}`);
	}
}

export default getSubcommand;
