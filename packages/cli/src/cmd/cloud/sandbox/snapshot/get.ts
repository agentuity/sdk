import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { createSandboxClient } from '../util';
import { getCommand } from '../../../../command-prefix';
import { snapshotGet } from '@agentuity/server';
import type { SnapshotFileInfo } from '@agentuity/server';

const SnapshotFileSchema = z.object({
	path: z.string(),
	size: z.number(),
});

const SnapshotGetResponseSchema = z.object({
	snapshotId: z.string().describe('Snapshot ID'),
	sandboxId: z.string().describe('Source sandbox ID'),
	tag: z.string().nullable().optional().describe('Snapshot tag'),
	sizeBytes: z.number().describe('Snapshot size in bytes'),
	fileCount: z.number().describe('Number of files'),
	parentSnapshotId: z.string().nullable().optional().describe('Parent snapshot ID'),
	createdAt: z.string().describe('Creation timestamp'),
	downloadUrl: z.string().optional().describe('Presigned download URL'),
	files: z.array(SnapshotFileSchema).optional().describe('Files in snapshot'),
});

export const getSubcommand = createCommand({
	name: 'get',
	aliases: ['info', 'show'],
	description: 'Get snapshot details',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, region: true, org: true },
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
		const { args, options, auth, region, logger, orgId } = ctx;
		const client = createSandboxClient(logger, auth, region);

		const snapshot = await snapshotGet(client, {
			snapshotId: args.snapshotId,
			orgId,
		});

		if (!options.json) {
			tui.info(`Snapshot: ${tui.bold(snapshot.snapshotId)}`);
			console.log(`  ${tui.muted('Sandbox:')} ${snapshot.sandboxId}`);
			if (snapshot.tag) {
				console.log(`  ${tui.muted('Tag:')}     ${snapshot.tag}`);
			}
			console.log(`  ${tui.muted('Size:')}    ${tui.formatBytes(snapshot.sizeBytes)}`);
			console.log(`  ${tui.muted('Files:')}   ${snapshot.fileCount}`);
			console.log(`  ${tui.muted('Created:')} ${snapshot.createdAt}`);
			if (snapshot.parentSnapshotId) {
				console.log(`  ${tui.muted('Parent:')}  ${snapshot.parentSnapshotId}`);
			}

			if (snapshot.files && snapshot.files.length > 0) {
				console.log('');
				tui.info('Files:');
				printFileTree(snapshot.files);
			}
		}

		return snapshot;
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

export default getSubcommand;
