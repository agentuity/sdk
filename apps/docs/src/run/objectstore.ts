/**
 * Standalone run script for Object Storage demo
 *
 * NOTE: Intentionally separate from src/agent/objectstore/agent.ts.
 * Uses dynamic filenames with cleanup (delete) operations.
 * See src/run/README.md for architecture details.
 *
 * Demonstrates: Write → Read flow with Bun's S3 API
 * Credentials are auto-injected by Agentuity runtime.
 *
 * Usage: bun run src/run/objectstore.ts '{}'
 */
import { createAgentContext } from "@agentuity/runtime";
import { s3 } from "bun";

const ctx = createAgentContext();

const filename = `demo-${Date.now()}.txt`;
const content = `Hello from Object Storage!\nTimestamp: ${new Date().toISOString()}`;

ctx.logger.info("Writing file");

// Write a file
const file = s3.file(filename);
await file.write(content);

ctx.logger.info("Reading file");

// Read it back
const readContent = await file.text();

// Check existence
const exists = await file.exists();

ctx.logger.info("Deleting file");

// Delete
await file.delete();

console.log("---OUTPUT---");
console.log(`Write: "${filename}"`);
console.log(`  Content: ${content.split("\n")[0]}...`);
console.log(`Read: "${filename}"`);
console.log(`  Content: ${readContent.split("\n")[0]}...`);
console.log(`Exists: ${exists}`);
console.log(`Deleted: "${filename}"`);
