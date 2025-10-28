import { homedir } from 'node:os';
import { join } from 'node:path';
import * as tui from './tui';

interface LegacyInstall {
	path: string;
	method: 'homebrew' | 'manual' | 'install-script';
}

/**
 * Check if the legacy (Go-based) Agentuity CLI is installed
 * and block execution with migration instructions
 */
export async function checkLegacyCLI(): Promise<void> {
	const homeDir = homedir();

	const legacyLocations = [
		'/opt/homebrew/bin/agentuity', // Homebrew ARM64 (M1/M2/M3 Macs)
		'/usr/local/bin/agentuity', // Homebrew Intel Macs / Linux
		'/usr/bin/agentuity', // System install
		join(homeDir, '.bin/agentuity'), // User bin from install script
		join(homeDir, 'bin/agentuity'), // User bin alternate
		join(homeDir, '.local/bin/agentuity'), // XDG user bin
	];

	const foundInstalls: LegacyInstall[] = [];

	// Check if Homebrew manages the agentuity package
	let isBrewManaged = false;
	try {
		const brewCheck = Bun.spawn(['brew', 'list', '--versions', 'agentuity'], {
			stdout: 'ignore',
			stderr: 'ignore',
		});
		const exitCode = await brewCheck.exited;
		isBrewManaged = exitCode === 0;
	} catch {
		// Homebrew not installed or command failed
	}

	// Check file system locations
	for (const location of legacyLocations) {
		const file = Bun.file(location);
		if (await file.exists()) {
			try {
				// Check if it's a compiled binary (not TypeScript)
				const proc = Bun.spawn(['file', location], { stdout: 'pipe' });
				const output = await new Response(proc.stdout).text();
				await proc.exited;

				if (output.includes('Mach-O') || output.includes('ELF')) {
					// Determine method: if brew manages the package, mark all installs as homebrew
					// otherwise check if it's in user home (install-script) or system (manual)
					const method = isBrewManaged
						? 'homebrew'
						: location.includes(homeDir)
							? 'install-script'
							: 'manual';
					foundInstalls.push({ path: location, method });
				}
			} catch {
				// Ignore errors
			}
		}
	}

	if (foundInstalls.length === 0 && !isBrewManaged) {
		return; // No legacy CLI found
	}

	// Block execution and show removal instructions
	tui.newline();
	tui.error('Legacy CLI Conflict Detected');
	tui.newline();

	console.log('  The legacy (Go-based) Agentuity CLI is installed and conflicts with the new');
	console.log('  TypeScript-based CLI. Please remove it before continuing.');
	tui.newline();

	// Filter installs into brew-managed and manual
	const brewInstalls = foundInstalls.filter(
		(install) => isBrewManaged || install.method === 'homebrew'
	);
	const manualInstalls = foundInstalls.filter(
		(install) => !isBrewManaged && install.method !== 'homebrew'
	);

	// Show Homebrew removal section if any brew-managed installs
	if (brewInstalls.length > 0) {
		console.log('  ' + tui.bold('Remove via Homebrew:'));
		tui.bullet('brew uninstall agentuity');
		tui.newline();

		// Show which files will be removed by brew
		console.log('  ' + tui.muted('This will remove:'));
		for (const install of brewInstalls) {
			console.log(`    "${install.path}"`);
		}
		tui.newline();
	}

	// Show manual removal section if any manual installs
	if (manualInstalls.length > 0) {
		console.log('  ' + tui.bold('Remove the following legacy CLI installations:'));
		tui.newline();

		for (const install of manualInstalls) {
			console.log(`  ${tui.muted('"' + install.path + '"')}`);

			if (install.method === 'install-script') {
				tui.bullet(`rm "${install.path}"`);
			} else {
				tui.bullet(`sudo rm "${install.path}"`);
			}
		}
		tui.newline();
	}

	console.log('  ' + tui.bold('After removal, install the new CLI:'));
	tui.bullet('bun install -g @agentuity/cli');
	tui.newline();

	console.log(`  Learn more: ${tui.link('https://docs.agentuity.dev/cli/migration')}`);
	tui.newline();

	process.exit(1);
}
