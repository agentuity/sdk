import { describe, test, expect } from 'bun:test';

import { listSubcommand as threadListSubcommand } from '../../../src/cmd/cloud/thread/list';
import { getSubcommand as threadGetSubcommand } from '../../../src/cmd/cloud/thread/get';
import { deleteSubcommand as threadDeleteSubcommand } from '../../../src/cmd/cloud/thread/delete';
import { deleteSubcommand as taskDeleteSubcommand } from '../../../src/cmd/cloud/task/delete';
import { listSubcommand as sessionListSubcommand } from '../../../src/cmd/cloud/session/list';
import { getSubcommand as sessionGetSubcommand } from '../../../src/cmd/cloud/session/get';
import { listSubcommand as dbListSubcommand } from '../../../src/cmd/cloud/db/list';
import { getSubcommand as dbGetSubcommand } from '../../../src/cmd/cloud/db/get';
import { deleteSubcommand as dbDeleteSubcommand } from '../../../src/cmd/cloud/db/delete';
import { logsSubcommand as dbLogsSubcommand } from '../../../src/cmd/cloud/db/logs';
import { listSubcommand as storageListSubcommand } from '../../../src/cmd/cloud/storage/list';
import { getSubcommand as storageGetSubcommand } from '../../../src/cmd/cloud/storage/get';
import { deleteSubcommand as storageDeleteSubcommand } from '../../../src/cmd/cloud/storage/delete';
import { uploadSubcommand as storageUploadSubcommand } from '../../../src/cmd/cloud/storage/upload';
import { downloadSubcommand as storageDownloadSubcommand } from '../../../src/cmd/cloud/storage/download';
import { command as sandboxCommand } from '../../../src/cmd/cloud/sandbox';
import { listSubcommand as sandboxListSubcommand } from '../../../src/cmd/cloud/sandbox/list';
import { getSubcommand as sandboxGetSubcommand } from '../../../src/cmd/cloud/sandbox/get';
import { deleteSubcommand as sandboxDeleteSubcommand } from '../../../src/cmd/cloud/sandbox/delete';
import { createSubcommand as sandboxCreateSubcommand } from '../../../src/cmd/cloud/sandbox/create';
import { runSubcommand as sandboxRunSubcommand } from '../../../src/cmd/cloud/sandbox/run';
import { execSubcommand as sandboxExecSubcommand } from '../../../src/cmd/cloud/sandbox/exec';
import { envSubcommand as sandboxEnvSubcommand } from '../../../src/cmd/cloud/sandbox/env';
import { lsSubcommand as sandboxLsSubcommand } from '../../../src/cmd/cloud/sandbox/ls';
import { uploadSubcommand as sandboxUploadSubcommand } from '../../../src/cmd/cloud/sandbox/upload';
import { downloadSubcommand as sandboxDownloadSubcommand } from '../../../src/cmd/cloud/sandbox/download';
import { runtimeCommand as sandboxRuntimeCommand } from '../../../src/cmd/cloud/sandbox/runtime';
import { snapshotCommand as sandboxSnapshotCommand } from '../../../src/cmd/cloud/sandbox/snapshot';
import { sshSubcommand } from '../../../src/cmd/cloud/ssh';
import { uploadCommand as scpUploadCommand } from '../../../src/cmd/cloud/scp/upload';
import { downloadCommand as scpDownloadCommand } from '../../../src/cmd/cloud/scp/download';
import { initSubcommand as projectAuthInitSubcommand } from '../../../src/cmd/project/auth/init';

describe('Global Database Commands - No Region Required', () => {
	describe('Thread Commands', () => {
		test('thread list does not require region', () => {
			const requires = threadListSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
			expect(requires?.auth).toBe(true);
		});

		test('thread get does not require region', () => {
			const requires = threadGetSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
			expect(requires?.auth).toBe(true);
		});

		test('thread delete does not require region', () => {
			const requires = threadDeleteSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
			expect(requires?.auth).toBe(true);
		});
	});

	describe('Session Commands', () => {
		test('session list does not require region', () => {
			const requires = sessionListSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
			expect(requires?.auth).toBe(true);
		});

		test('session get does not require region', () => {
			const requires = sessionGetSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
			expect(requires?.auth).toBe(true);
		});
	});

	describe('Task Commands', () => {
		test('task delete does not require region', () => {
			const requires = taskDeleteSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
			expect(requires?.auth).toBe(true);
		});

		test('task delete has destructive tag', () => {
			expect(taskDeleteSubcommand.tags).toContain('destructive');
			expect(taskDeleteSubcommand.tags).toContain('deletes-resource');
		});
	});

	describe('Database Commands', () => {
		test('db list does not require region', () => {
			const requires = dbListSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
			expect(requires?.auth).toBe(true);
			// org is not required - auto-discovered from resource
		});

		test('db get does not require region', () => {
			const requires = dbGetSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
			expect(requires?.auth).toBe(true);
			// org is not required - auto-discovered from resource
		});

		test('db delete does not require region', () => {
			const requires = dbDeleteSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
			expect(requires?.auth).toBe(true);
			// org is not required - auto-discovered from resource
		});

		test('db logs does not require region', () => {
			const requires = dbLogsSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
			expect(requires?.auth).toBe(true);
			// org is not required - auto-discovered from resource
		});
	});

	describe('Storage Commands', () => {
		test('storage list does not require region', () => {
			const requires = storageListSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
			expect(requires?.auth).toBe(true);
			// org is not in subcommand requires - parent command or runtime handles org discovery
		});

		test('storage get does not require region or org (auto-discovered)', () => {
			const requires = storageGetSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
			expect(requires?.auth).toBe(true);
			// org is optional - auto-discovered from resource name via cache or API
		});

		test('storage delete does not require region or org (auto-discovered)', () => {
			const requires = storageDeleteSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
			expect(requires?.auth).toBe(true);
			// org is optional - auto-discovered from resource name via cache or API
		});

		test('storage upload does not require region or org (auto-discovered)', () => {
			const requires = storageUploadSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
			expect(requires?.auth).toBe(true);
			// org is optional - auto-discovered from resource name via cache or API
		});

		test('storage download does not require region or org (auto-discovered)', () => {
			const requires = storageDownloadSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
			expect(requires?.auth).toBe(true);
			// org is optional - auto-discovered from resource name via cache or API
		});
	});

	describe('Sandbox Commands', () => {
		test('sandbox parent command does not require region', () => {
			const requires = sandboxCommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
			expect(requires?.auth).toBe(true);
			expect(requires?.org).toBe(true);
		});

		test('sandbox list does not require region', () => {
			const requires = sandboxListSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
			expect(requires?.auth).toBe(true);
			// org is inherited from parent sandbox command, not set on subcommand
		});

		test('sandbox get does not require region', () => {
			const requires = sandboxGetSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
			expect(requires?.auth).toBe(true);
			// org is auto-discovered via sandboxResolve
		});

		test('sandbox delete does not require region', () => {
			const requires = sandboxDeleteSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
			expect(requires?.auth).toBe(true);
			// org is auto-discovered via sandboxResolve
		});

		test('sandbox exec does not require region', () => {
			const requires = sandboxExecSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
			expect(requires?.auth).toBe(true);
			// org is auto-discovered via sandboxResolve
		});

		test('sandbox env does not require region', () => {
			const requires = sandboxEnvSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
			expect(requires?.auth).toBe(true);
			// org is auto-discovered via sandboxResolve
		});

		test('sandbox ls does not require region', () => {
			const requires = sandboxLsSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
			expect(requires?.auth).toBe(true);
			// org is auto-discovered via sandboxResolve
		});

		test('sandbox upload does not require region', () => {
			const requires = sandboxUploadSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
			expect(requires?.auth).toBe(true);
			// org is auto-discovered via sandboxResolve
		});

		test('sandbox download does not require region', () => {
			const requires = sandboxDownloadSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
			expect(requires?.auth).toBe(true);
			// org is auto-discovered via sandboxResolve
		});

		test('sandbox runtime parent command does not require region', () => {
			const requires = sandboxRuntimeCommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
		});

		test('sandbox snapshot parent command does not require region', () => {
			const requires = sandboxSnapshotCommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
		});

		// These commands should KEEP region requirement (creating new resources)
		test('sandbox create REQUIRES region (creating new resource)', () => {
			const requires = sandboxCreateSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBe(true);
			expect(requires?.auth).toBe(true);
			expect(requires?.org).toBe(true);
		});

		test('sandbox run REQUIRES region (creating new resource)', () => {
			const requires = sandboxRunSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBe(true);
			expect(requires?.auth).toBe(true);
			expect(requires?.org).toBe(true);
		});
	});

	describe('SSH/SCP Commands', () => {
		test('ssh does not require region (auto-lookup)', () => {
			const requires = sshSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
			expect(requires?.auth).toBe(true);
			expect(requires?.apiClient).toBe(true);
		});

		test('scp upload does not require region (auto-lookup)', () => {
			const requires = scpUploadCommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
			expect(requires?.auth).toBe(true);
			expect(requires?.apiClient).toBe(true);
		});

		test('scp download does not require region (auto-lookup)', () => {
			const requires = scpDownloadCommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
			expect(requires?.auth).toBe(true);
			expect(requires?.apiClient).toBe(true);
		});
	});

	describe('Project Commands', () => {
		test('project auth init does not require region', () => {
			const requires = projectAuthInitSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
			expect(requires?.auth).toBe(true);
			expect(requires?.org).toBe(true);
		});
	});
});
