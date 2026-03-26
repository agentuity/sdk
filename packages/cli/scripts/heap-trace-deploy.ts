#!/usr/bin/env bun

/**
 * Heap Trace Deploy
 *
 * Monitors RSS memory of the deploy process tree (parent fork wrapper,
 * child deploy, grandchild tsc/vite/npm) to identify memory hotspots.
 *
 * Usage:
 *   bun run packages/cli/scripts/heap-trace-deploy.ts [project-path]
 *
 * Environment variables are passed through, so set AGENTUITY_PROFILE,
 * AGENTUITY_REGION, etc. as needed:
 *   AGENTUITY_PROFILE=local AGENTUITY_REGION=local \
 *     bun run packages/cli/scripts/heap-trace-deploy.ts ~/tmp/v1/test-hi
 *
 * Output:
 *   - TSV file with per-process RSS samples (one row per PID per sample)
 *   - Summary table of peak RSS per process printed to stdout
 *
 * Process tree (what gets tracked):
 *   heap-trace-deploy.ts (this script)
 *     └─ bunx agentuity deploy          (parent / fork wrapper)
 *         └─ bunx agentuity deploy --child-mode  (child / actual build)
 *             ├─ bunx tsc --noEmit ...   (typecheck)
 *             ├─ vite (in-process)       (client build — no separate PID)
 *             └─ npm install ...         (server externals install)
 */

import { createWriteStream } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

interface ProcInfo {
	pid: number;
	ppid: number;
	rssKb: number;
	command: string;
}

interface PeakInfo {
	pid: number;
	ppid: number;
	command: string;
	peakRssKb: number;
	firstSeenMs: number;
	lastSeenMs: number;
	maxDepth: number;
}

const sampleIntervalMs = 500;
const projectPath = process.argv[2] ?? join(homedir(), 'tmp', 'v1', 'test-hi');
const startedAt = Date.now();
const outputPath = join(process.cwd(), `heap-trace-${startedAt}.tsv`);

async function readLinuxProcessTable(): Promise<Map<number, ProcInfo>> {
	const proc = new Map<number, ProcInfo>();
	const entries = await readdir('/proc');

	await Promise.all(
		entries
			.filter((entry) => /^\d+$/.test(entry))
			.map(async (entry) => {
				const pid = Number(entry);
				try {
					const status = await readFile(`/proc/${entry}/status`, 'utf8');
					let name = '';
					let ppid = 0;
					let rssKb = 0;

					for (const line of status.split('\n')) {
						if (line.startsWith('Name:')) {
							name = line.slice(5).trim();
						} else if (line.startsWith('PPid:')) {
							ppid = Number(line.slice(5).trim()) || 0;
						} else if (line.startsWith('VmRSS:')) {
							const parts = line.trim().split(/\s+/);
							rssKb = Number(parts[1]) || 0;
						}
					}

					proc.set(pid, { pid, ppid, rssKb, command: name || 'unknown' });
				} catch {
					// Process may exit while being sampled.
				}
			})
	);

	return proc;
}

async function readPsProcessTable(): Promise<Map<number, ProcInfo>> {
	const proc = new Map<number, ProcInfo>();
	const ps = Bun.spawn({
		cmd: ['ps', '-axo', 'pid=,ppid=,rss=,comm='],
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const output = await new Response(ps.stdout).text();
	await ps.exited;

	for (const line of output.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const parts = trimmed.split(/\s+/);
		if (parts.length < 4) continue;

		const pid = Number(parts[0]);
		const ppid = Number(parts[1]);
		const rssKb = Number(parts[2]);
		const command = parts.slice(3).join(' ');
		if (!Number.isFinite(pid) || !Number.isFinite(ppid) || !Number.isFinite(rssKb)) continue;

		proc.set(pid, { pid, ppid, rssKb, command });
	}

	return proc;
}

async function readProcessTable(): Promise<Map<number, ProcInfo>> {
	if (process.platform === 'linux') {
		return readLinuxProcessTable();
	}
	return readPsProcessTable();
}

function collectDescendants(rootPid: number, table: Map<number, ProcInfo>) {
	const depths = new Map<number, number>();
	if (!table.has(rootPid)) return depths;

	depths.set(rootPid, 0);
	const queue = [rootPid];

	while (queue.length > 0) {
		const pid = queue.shift()!;
		const depth = depths.get(pid) ?? 0;
		for (const info of table.values()) {
			if (info.ppid === pid && !depths.has(info.pid)) {
				depths.set(info.pid, depth + 1);
				queue.push(info.pid);
			}
		}
	}

	return depths;
}

function formatMb(kb: number): string {
	return `${(kb / 1024).toFixed(1)} MiB`;
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
	return `${(ms / 60000).toFixed(1)}m`;
}

function updateSample(
	peaks: Map<number, PeakInfo>,
	pid: number,
	info: ProcInfo,
	depth: number,
	now: number
) {
	const existing = peaks.get(pid);
	if (!existing) {
		peaks.set(pid, {
			pid,
			ppid: info.ppid,
			command: info.command,
			peakRssKb: info.rssKb,
			firstSeenMs: now,
			lastSeenMs: now,
			maxDepth: depth,
		});
	} else {
		existing.peakRssKb = Math.max(existing.peakRssKb, info.rssKb);
		existing.lastSeenMs = now;
		existing.maxDepth = Math.max(existing.maxDepth, depth);
	}
}

async function main() {
	console.log(`\n📊 Heap Trace Deploy`);
	console.log(`   Project: ${projectPath}`);
	console.log(`   Command: bunx agentuity deploy`);
	console.log(`   Sample interval: ${sampleIntervalMs}ms`);
	console.log(`   Output: ${outputPath}\n`);

	const writer = createWriteStream(outputPath);
	writer.write('elapsed_ms\tpid\tppid\tdepth\trss_kb\tcommand\n');

	// Run the FULL deploy flow (not --child-mode) so we get the fork wrapper
	// spawning the child process, which spawns tsc, npm, etc.
	const deploy = Bun.spawn({
		cmd: ['bunx', 'agentuity', 'deploy'],
		cwd: projectPath,
		env: process.env,
		stdin: 'inherit',
		stdout: 'inherit',
		stderr: 'inherit',
	});

	const peaks = new Map<number, PeakInfo>();
	let exitCode: number | undefined;
	let sampleCount = 0;
	let totalTracked = 0;

	deploy.exited.then((code) => {
		exitCode = code;
	});

	while (exitCode === undefined) {
		const now = Date.now();
		const elapsed = now - startedAt;
		const table = await readProcessTable();
		const tracked = collectDescendants(deploy.pid, table);

		for (const [pid, depth] of tracked.entries()) {
			const info = table.get(pid);
			if (!info) continue;

			writer.write(
				`${elapsed}\t${info.pid}\t${info.ppid}\t${depth}\t${info.rssKb}\t${info.command.replace(/\t/g, ' ')}\n`
			);
			updateSample(peaks, pid, info, depth, now);
			totalTracked++;
		}

		sampleCount++;
		await Bun.sleep(sampleIntervalMs);
	}

	// One final sample after process exit to capture any lagging descendants.
	const finalNow = Date.now();
	const finalElapsed = finalNow - startedAt;
	const finalTable = await readProcessTable();
	const finalTracked = collectDescendants(deploy.pid, finalTable);
	for (const [pid, depth] of finalTracked.entries()) {
		const info = finalTable.get(pid);
		if (!info) continue;
		writer.write(
			`${finalElapsed}\t${info.pid}\t${info.ppid}\t${depth}\t${info.rssKb}\t${info.command.replace(/\t/g, ' ')}\n`
		);
		updateSample(peaks, pid, info, depth, finalNow);
	}

	await new Promise<void>((resolve) => writer.end(resolve));

	// Build summary
	const all = Array.from(peaks.values()).sort((a, b) => b.peakRssKb - a.peakRssKb);
	const root = all.find((p) => p.pid === deploy.pid);
	const children = all.filter((p) => p.maxDepth === 1);
	const grandchildren = all.filter((p) => p.maxDepth >= 2);

	const rootPeak = root?.peakRssKb ?? 0;
	const childPeak = children.reduce((max, p) => Math.max(max, p.peakRssKb), 0);
	const grandchildPeak = grandchildren.reduce((max, p) => Math.max(max, p.peakRssKb), 0);
	const totalPeak = all.reduce((sum, p) => sum + p.peakRssKb, 0);

	console.log(`\n${'═'.repeat(60)}`);
	console.log('  Peak RSS Summary');
	console.log(`${'═'.repeat(60)}`);
	console.log(`  Deploy (fork wrapper)  PID ${deploy.pid}: ${formatMb(rootPeak)}`);
	console.log(
		`  Child (build process)  peak: ${formatMb(childPeak)} (${children.length} process${children.length !== 1 ? 'es' : ''})`
	);
	console.log(
		`  Grandchild+ (tsc/npm)  peak: ${formatMb(grandchildPeak)} (${grandchildren.length} process${grandchildren.length !== 1 ? 'es' : ''})`
	);
	console.log(`  Combined peak (approx): ${formatMb(totalPeak)}`);
	console.log(`${'─'.repeat(60)}`);
	console.log(`  Duration: ${formatDuration(finalNow - startedAt)}`);
	console.log(`  Samples: ${sampleCount} (${totalTracked} data points)`);
	console.log(`  Exit code: ${exitCode}`);
	console.log(`  Trace file: ${outputPath}`);
	console.log(`${'═'.repeat(60)}`);

	if (all.length > 0) {
		console.log(`\n  Top processes by peak RSS:`);
		console.log(
			`  ${'PID'.padEnd(8)}${'DEPTH'.padEnd(7)}${'PEAK RSS'.padEnd(14)}${'LIFETIME'.padEnd(12)}COMMAND`
		);
		for (const p of all.slice(0, 20)) {
			const lifetime = formatDuration(p.lastSeenMs - p.firstSeenMs);
			console.log(
				`  ${String(p.pid).padEnd(8)}${String(p.maxDepth).padEnd(7)}${formatMb(p.peakRssKb).padEnd(14)}${lifetime.padEnd(12)}${p.command}`
			);
		}
	}
	console.log('');

	if ((exitCode ?? 1) !== 0) {
		process.exit(exitCode ?? 1);
	}
}

await main();
