---
name: sandbox-test
description: Run non-deterministic fuzz tests against Agentuity sandbox capabilities. Each invocation randomly selects up to 10 different operations across lifecycle, execution, file I/O, environment, checkpoints, and snapshots to find bugs and edge cases. Automatically files bug reports and enhancement suggestions.
version: 1.0.0
---

# Sandbox Fuzz Test

You are a sandbox quality engineer. Your job is to stress-test the Agentuity sandbox infrastructure by running a random selection of operations and verifying their behavior. Each run should be DIFFERENT from the last — vary the actions, parameters, ordering, and region to maximize bug discovery.

**When you find a bug, you file it automatically.** When you spot an improvement opportunity, you file that too.

## Global CLI Flags

Different commands accept different flags. Know which flags go where:

| Flag | Scope | Description |
|------|-------|-------------|
| `--org-id <id>` | **Global** — works on any `agentuity` command | Selects the organization |
| `--region <region>` | **Sandbox commands only** — `sandbox create`, `sandbox list`, `sandbox stats`, etc. | Selects the cloud region |
| `--json` | **Global** — works on any command | Machine-readable output |
| `--tag <name>` | **Task commands** — `task create` | Attaches a tag (repeatable, auto-creates missing tags) |

**IMPORTANT**:
- `--region` is only valid on `agentuity cloud sandbox` subcommands. Do NOT pass it to `task create` or other non-sandbox commands.
- `--org-id` is a global flag and works everywhere.
- The region is randomly selected once per run (see Phase 0) and used on all sandbox operations.

## Organization Context

This skill operates across two organizations:

| Purpose | Org ID | Why |
|---------|--------|-----|
| **Running sandbox tests** | `org_38uEd1JNXIe89KMPaOwx1WJW43o` | Test org — sandboxes are created and destroyed here |
| **Filing bug reports & enhancements** | `org_2u8RgDTwcZWrZrZ3sZh24T5FCtz` | Main org — where the team tracks work |

Sandbox operations include `--org-id org_38uEd1JNXIe89KMPaOwx1WJW43o`. Task creation includes `--org-id org_2u8RgDTwcZWrZrZ3sZh24T5FCtz`.

## Protocol

1. **Region & Seed** — Pick a random region and seed for this run
2. **Cleanup Orphans** — Find and delete any leftover `fuzz-test-*` sandboxes from previous runs
3. **Setup** — Create one interactive sandbox in the test org
4. **Select** — Randomly pick 10 actions from the action pool below
5. **Execute** — Run each action, validate the result, record pass/fail
6. **File Bugs** — For every failure, create a bug report in the main org
7. **File Enhancements** — For improvement opportunities, create enhancement tasks in the main org
8. **Teardown** — Always delete the sandbox (even if tests fail)
9. **Post-Teardown Probe** — Verify deleted sandbox returns clean errors
10. **Report** — Output structured results including filed task IDs

## CRITICAL RULES

- **Always use `--json` flags** on every CLI command for machine-readable output
- **Always use `--region $REGION`** on sandbox commands (create, list, exec, get, delete, etc.)
- **Never pass `--region`** to non-sandbox commands (task create, etc.) — it will error
- **Always clean up** — delete the sandbox in a finally block, no matter what
- **Stop on first failure** — record the failure, file the bug, skip remaining actions, go to teardown
- **Validate every response** — check exit codes, parse JSON output, verify state
- **Capture session IDs from failures** — if a failed response includes a session ID (format: `sess_` followed by alphanumeric characters, e.g. `sess_abc123def456`), always include it in the bug report. Look for it in JSON response fields, headers, or error messages.
- **Never hardcode sandbox IDs** — capture from create output and reuse
- **Working directory inside sandbox is `/home/agentuity`**
- **Use `--confirm` on destructive commands** to skip interactive prompts
- **Before teardown, resume the sandbox if it is paused**
- **File a bug report for every FAILURE**
- **File an enhancement for every improvement opportunity**

## Bug Reporting

When an action **fails** (see "What Constitutes a Bug" at the end), immediately file a bug report in the **main org**:

```bash
agentuity cloud task create "<title>" \
  --org-id org_2u8RgDTwcZWrZrZ3sZh24T5FCtz \
  --type bug \
  --priority <priority> \
  --created-type agent \
  --created-name "sandbox-fuzz-tester" \
  --tag sandbox \
  --description "<description>" \
  --metadata '{"source":"sandbox-fuzz-test","action_id":"<ACTION_ID>","category":"<CATEGORY>","sandbox_id":"<SANDBOX_ID>","runtime":"<RUNTIME>","region":"<REGION>","seed":"<SEED>","session_id":"<SESSION_ID_IF_PRESENT>"}' \
  --json
```

### Bug Title Convention

```
[sandbox-fuzz] <Category>: <Short description of failure>
```

Examples:
- `[sandbox-fuzz] Execution: exit code 0 reported for failing command`
- `[sandbox-fuzz] Files: cp silently succeeds to non-existent directory`
- `[sandbox-fuzz] Checkpoint: restore does not revert file content`
- `[sandbox-fuzz] Lifecycle: delete returns success but sandbox still accessible`

### Bug Description Format

The `--description` field supports **full Markdown** — use headings, code blocks, bold, lists, and tables to make the report clear and readable. Structure it as a reproduction report:

```
## Reproduction

**Action**: <ACTION_ID> - <Description>
**Sandbox ID**: <sandboxId>
**Runtime**: <runtime>
**Region**: <REGION>
**Random Seed**: <seed>

## Commands Executed

<exact commands that were run, one per line>

## Expected Behavior

<what should have happened>

## Actual Behavior

<what actually happened>

## Exit Code

<reported exit code>

## Output

<relevant stdout/stderr, truncated to 2000 chars if longer>

## Session ID

<session ID from the failed response if present, e.g. sess_abc123def456 — omit this section if no session ID was returned>

## Environment

- CLI: agentuity (via sandbox-fuzz-test skill)
- Region: <REGION>
- Test Org: org_38uEd1JNXIe89KMPaOwx1WJW43o
- Created by: sandbox-fuzz-tester agent
```

### Bug Priority Rules

| Condition | Priority |
|-----------|----------|
| CLI crashes, stack traces, segfaults | `high` |
| Data corruption (file content changed, env var mangled) | `high` |
| State inconsistency (checkpoint restore fails, delete doesn't delete) | `high` |
| Wrong exit code (reports 0 when failed, or non-zero when succeeded) | `medium` |
| JSON response malformed or missing expected fields | `medium` |
| Silent failures (operation fails but no error reported) | `medium` |
| Sandbox becomes unresponsive after valid operation | `medium` |
| Timeout with no explanation | `low` |
| Vague error messages (correct behavior, unclear message) | `low` |

### Capture the Task ID

After filing each bug, capture the `task.id` from the JSON response and include it in the final report.

If the task creation itself fails, log the failure in the report but do NOT treat it as a test failure — continue with teardown.

## Enhancement Reporting

When you observe something that **works correctly but could be improved** for the user, file an enhancement task in the **main org**:

```bash
agentuity cloud task create "<title>" \
  --org-id org_2u8RgDTwcZWrZrZ3sZh24T5FCtz \
  --type enhancement \
  --priority low \
  --created-type agent \
  --created-name "sandbox-fuzz-tester" \
  --tag sandbox \
  --description "<description>" \
  --metadata '{"source":"sandbox-fuzz-test","action_id":"<ACTION_ID>","category":"<CATEGORY>","sandbox_id":"<SANDBOX_ID>","region":"<REGION>"}' \
  --json
```

**Use Markdown in descriptions** — headings, code blocks, bold, lists, and tables are all supported.

### Enhancement Title Convention

```
[sandbox-fuzz] Enhancement: <Short description of improvement>
```

### What Qualifies as an Enhancement

File an enhancement when you observe:
- **Vague error messages** — behavior is correct but the error message doesn't help the user understand what went wrong or how to fix it (e.g., "internal error" instead of "directory not found: /path")
- **Missing fields in JSON output** — the response works but is missing useful information the user might expect (e.g., no `duration` field, no `size` on file listing)
- **Inconsistent output formats** — similar commands return data in different shapes (e.g., one uses `sandboxId`, another uses `sandbox_id`)
- **Unusually slow operations** — an operation takes >30s for something that should be fast; suggest investigating or adding progress feedback
- **Poor defaults** — a default value seems wrong or unhelpful (e.g., timeout too short, working directory unexpected)
- **Missing convenience** — a common workflow requires extra steps that the CLI could simplify (e.g., having to manually create parent dirs before copying a file)
- **Unclear status values** — sandbox status transitions aren't well-documented or are confusing (e.g., `idle` vs `running` ambiguity)

### Enhancement Description Format

The description supports **full Markdown**. Use it to make the suggestion clear:

```
## Observation

<What you observed during testing>

## Current Behavior

<How it works now>

## Suggested Improvement

<What would be better for the user>

## Context

- Action: <ACTION_ID>
- Sandbox ID: <sandboxId>
- Region: <REGION>
- CLI: agentuity (via sandbox-fuzz-test skill)
```

**Do NOT file enhancements for:**
- Things that are clearly intentional design choices
- Performance within normal bounds
- Features that are simply not implemented yet (unless they seem like obvious gaps)

## Phase 0: Region & Seed Selection

Before anything else, select a random region and seed for this run.

**Pick a region:**
```bash
REGIONS=(usw usc use)
REGION=${REGIONS[$((RANDOM % 3))]}
echo "Selected region: $REGION"
```

Available regions:
| Code | Name |
|------|------|
| `usw` | US West |
| `usc` | US Central |
| `use` | US East |

**Pick a seed:**
```bash
SEED=$((RANDOM % 1000))
echo "Random seed: $SEED"
```

Record both values. The **REGION** is used in every `agentuity` CLI command for the rest of the run. The **SEED** is used for action selection and included in bug reports for reproducibility.

## Phase 1: Cleanup Orphaned Sandboxes

Previous fuzz test runs may have crashed or timed out before teardown, leaving orphaned sandboxes. **Always clean these up before creating a new one.**

List all sandboxes in the test org and look for any with names starting with `fuzz-test-`:

```bash
agentuity cloud sandbox list \
  --region $REGION \
  --org-id org_38uEd1JNXIe89KMPaOwx1WJW43o \
  --json
```

Parse the JSON response. For every sandbox in the `sandboxes` array whose `name` starts with `fuzz-test-` and whose status is NOT `terminated`:

1. Attempt to resume it first (in case it's paused):
   ```bash
   agentuity cloud sandbox resume <orphanId> --region $REGION --json 2>/dev/null || true
   ```

2. Delete it:
   ```bash
   agentuity cloud sandbox delete <orphanId> --region $REGION --confirm --json
   ```

3. Log how many orphans were cleaned up. If a delete fails, log the failure but continue — do not let orphan cleanup block the test run.

**NOTE**: Sandboxes may exist in regions other than the one selected for this run. To be thorough, check all three regions:

```bash
for R in usw usc use; do
  agentuity cloud sandbox list \
    --region $R \
    --org-id org_38uEd1JNXIe89KMPaOwx1WJW43o \
    --json
  # Parse and delete any fuzz-test-* sandboxes found
done
```

If no orphans are found, proceed immediately to setup.

## Phase 2: Setup

Create the test sandbox in the **test org** using the selected region:

```bash
agentuity cloud sandbox create \
  --region $REGION \
  --org-id org_38uEd1JNXIe89KMPaOwx1WJW43o \
  --name "fuzz-test-$(date +%s)" \
  --description "Automated fuzz test run (region: $REGION, seed: $SEED)" \
  --runtime bun:1 \
  --network \
  --json
```

Capture the `sandboxId` from the JSON response. ALL subsequent sandbox commands use this ID.

Verify the sandbox was created by running:

```bash
agentuity cloud sandbox get <sandboxId> --region $REGION --json
```

Confirm status is `idle` or `running`.

## Phase 3: Random Action Selection

Select exactly 10 actions from the pool below. To ensure non-determinism:

1. Use the seed from Phase 0 to shuffle the action pool
2. Pick 10 actions, ensuring at least one from each category: Execution (A), Files (B), Environment (C), Lifecycle (D), Checkpoints (E), Edge Cases (F). The remaining 4 picks are free choices from any category.
3. Vary the parameters within each action (different filenames, values, paths, etc.)
4. Do NOT always pick the same actions or run them in the same order

**Pick guidance**: A: 2 minimum, B: 2 minimum, C: 1 minimum, D: 1 minimum, E: 1 minimum, F: 1 minimum = 8 required + 2 free picks from any category = 10 total.

## Phase 4: Action Pool

**REMINDER**: All sandbox commands below must include `--region $REGION`. This flag is omitted from individual action examples for brevity. **Always append it to sandbox commands.** Do NOT append `--region` to non-sandbox commands like `task create`.

### Category A: Command Execution (pick 2+)

#### A1: Simple Command Output
```bash
agentuity cloud sandbox exec <sandboxId> --json -- echo "hello world"
```
**Validate**: JSON response contains `exitCode: 0` and output includes `hello world`.

#### A2: Failing Command
```bash
agentuity cloud sandbox exec <sandboxId> --json -- sh -c "exit 42"
```
**Validate**: JSON response contains `exitCode: 42` (non-zero). This is a PASS if the exit code is correctly reported.

#### A3: Multi-Command Pipeline
```bash
agentuity cloud sandbox exec <sandboxId> --json -- sh -c "mkdir -p /tmp/testdir && echo 'content' > /tmp/testdir/file.txt && cat /tmp/testdir/file.txt"
```
**Validate**: Exit code 0, output includes `content`.

#### A4: Large Output Handling
```bash
agentuity cloud sandbox exec <sandboxId> --json -- sh -c "seq 1 5000"
```
**Validate**: Exit code 0, output is not truncated (should contain `5000`).

#### A5: Environment Variable Access
```bash
agentuity cloud sandbox exec <sandboxId> --json -- printenv HOME
```
**Validate**: Exit code 0, output includes `/home/agentuity`.

#### A6: Command With Special Characters
```bash
agentuity cloud sandbox exec <sandboxId> --json -- sh -c 'echo "quotes nested here" && echo "dollar \$HOME end"'
```
**Validate**: Exit code 0, output contains `dollar /home/agentuity end` (the sandbox's `$HOME` should resolve to `/home/agentuity`).

#### A7: Command Timeout Behavior
```bash
agentuity cloud sandbox exec <sandboxId> --timeout 5s --json -- sh -c "echo fast"
```
**Validate**: Completes successfully within timeout, exit code 0.

#### A8: Process Information
```bash
agentuity cloud sandbox exec <sandboxId> --json -- sh -c 'echo "PID=$$" && whoami && pwd'
```
**Validate**: Exit code 0, output contains PID, username, and working directory.

#### A9: Stderr Handling
```bash
agentuity cloud sandbox exec <sandboxId> --json -- sh -c "echo stdout_msg && echo stderr_msg >&2"
```
**Validate**: Exit code 0. Check whether both stdout and stderr content are captured.

#### A10: Binary/Non-UTF8 Output
```bash
agentuity cloud sandbox exec <sandboxId> --json -- sh -c "printf '\\x00\\x01\\x02\\xff'"
```
**Validate**: Command completes without crashing. Exit code 0. The key test is that binary output doesn't break the JSON response.

---

### Category B: File Operations (pick 2+)

#### B1: Nested Directory Creation
```bash
agentuity cloud sandbox mkdir <sandboxId> /home/agentuity/deep/nested/path/here --parents --json
```
**Validate**: JSON response indicates success. Then verify with:
```bash
agentuity cloud sandbox files <sandboxId> /home/agentuity/deep/nested/path --json
```
Should list `here` as a directory entry.

#### B2: File Copy Round-Trip
Create a local temp file, copy to sandbox, copy back, compare:
```bash
echo "round-trip-test-$(date +%s)" > /tmp/sandbox-test-upload.txt
agentuity cloud sandbox cp /tmp/sandbox-test-upload.txt <sandboxId>:/home/agentuity/uploaded.txt --json
agentuity cloud sandbox cp <sandboxId>:/home/agentuity/uploaded.txt /tmp/sandbox-test-download.txt --json
diff /tmp/sandbox-test-upload.txt /tmp/sandbox-test-download.txt
```
**Validate**: `diff` returns exit code 0 (files are identical).

#### B3: File Listing with Long Format
```bash
agentuity cloud sandbox files <sandboxId> /home/agentuity --long --json
```
**Validate**: JSON contains file entries with `mode`, `modTime`, `size` fields.

#### B4: File Removal
First create a file, then remove it, then verify it's gone:
```bash
agentuity cloud sandbox exec <sandboxId> --json -- touch /home/agentuity/delete-me.txt
agentuity cloud sandbox rm <sandboxId> /home/agentuity/delete-me.txt --json
agentuity cloud sandbox files <sandboxId> /home/agentuity --json
```
**Validate**: File `delete-me.txt` does not appear in the file listing after removal.

#### B5: Directory Removal (Recursive)
```bash
agentuity cloud sandbox exec <sandboxId> --json -- sh -c "mkdir -p /home/agentuity/rmtest/sub1/sub2 && touch /home/agentuity/rmtest/sub1/file.txt"
agentuity cloud sandbox rmdir <sandboxId> /home/agentuity/rmtest --recursive --json
agentuity cloud sandbox files <sandboxId> /home/agentuity --json
```
**Validate**: `rmtest` directory no longer appears in listing.

#### B6: File With Spaces in Name
```bash
agentuity cloud sandbox exec <sandboxId> --json -- sh -c "echo 'space test' > '/home/agentuity/file with spaces.txt'"
agentuity cloud sandbox files <sandboxId> /home/agentuity --json
```
**Validate**: File listing includes an entry with spaces in the name.

#### B7: Copy File to Non-Existent Directory
Create a self-contained source file, then try to copy to a non-existent path:
```bash
echo "b7-nonexistent-path-test" > /tmp/sandbox-b7-upload.txt
agentuity cloud sandbox cp /tmp/sandbox-b7-upload.txt <sandboxId>:/home/agentuity/nonexistent/path/file.txt --json
```
**Validate**: Should return an error. This is a PASS if the error is clear and descriptive. FAIL if it silently succeeds or crashes.

#### B8: Zero-Byte File Handling
```bash
touch /tmp/sandbox-empty-file.txt
agentuity cloud sandbox cp /tmp/sandbox-empty-file.txt <sandboxId>:/home/agentuity/empty.txt --json
agentuity cloud sandbox files <sandboxId> /home/agentuity --long --json
```
**Validate**: File exists with size 0.

---

### Category C: Environment Variables (pick 1+)

#### C1: Set and Verify
```bash
agentuity cloud sandbox env <sandboxId> TEST_VAR=hello_world --json
agentuity cloud sandbox exec <sandboxId> --json -- printenv TEST_VAR
```
**Validate**: First command succeeds. Second command output includes `hello_world`.

#### C2: Set Multiple Variables
```bash
agentuity cloud sandbox env <sandboxId> VAR_A=alpha VAR_B=beta VAR_C=gamma --json
agentuity cloud sandbox exec <sandboxId> --json -- sh -c 'echo $VAR_A-$VAR_B-$VAR_C'
```
**Validate**: Output includes `alpha-beta-gamma`.

#### C3: Delete Environment Variable
```bash
agentuity cloud sandbox env <sandboxId> TEMP_VAR=exists --json
agentuity cloud sandbox env <sandboxId> --delete TEMP_VAR --json
agentuity cloud sandbox exec <sandboxId> --json -- printenv TEMP_VAR
```
**Validate**: Final `printenv` should fail (exit code 1) since variable is deleted.

#### C4: Special Characters in Value
```bash
agentuity cloud sandbox env <sandboxId> SPECIAL_VAR="hello world=foo&bar" --json
agentuity cloud sandbox exec <sandboxId> --json -- printenv SPECIAL_VAR
```
**Validate**: Value is preserved exactly, including spaces, equals signs, and ampersands.

---

### Category D: Lifecycle & Info Operations (pick 1+)

#### D1: Pause and Resume
```bash
agentuity cloud sandbox pause <sandboxId> --json
agentuity cloud sandbox get <sandboxId> --json
```
**Validate**: Status changes to `paused` or `suspended`.

Then resume:
```bash
agentuity cloud sandbox resume <sandboxId> --json
agentuity cloud sandbox get <sandboxId> --json
```
**Validate**: Status changes back to `idle` or `running`. Then execute a command to verify sandbox still works:
```bash
agentuity cloud sandbox exec <sandboxId> --json -- echo "post-resume-check"
```

**IMPORTANT**: After running D1, wait a moment and verify the sandbox is responsive before continuing other actions.

#### D2: Get Sandbox Metadata
```bash
agentuity cloud sandbox get <sandboxId> --json
```
**Validate**: Response contains all expected fields: `sandboxId`, `name`, `status`, `region`, `runtime`, `createdAt`, `resources`.

#### D3: List Sandboxes
```bash
agentuity cloud sandbox list --org-id org_38uEd1JNXIe89KMPaOwx1WJW43o --json
```
**Validate**: Response includes the sandbox created in setup. Parse the JSON `sandboxes` array and confirm an entry with the matching `sandboxId` exists.

#### D4: Execution History
Run a command first, then check execution list:
```bash
agentuity cloud sandbox exec <sandboxId> --json -- echo "history-test"
agentuity cloud sandbox execution list <sandboxId> --json
```
**Validate**: Execution list contains at least one entry.

#### D5: Sandbox Stats
```bash
agentuity cloud sandbox stats --org-id org_38uEd1JNXIe89KMPaOwx1WJW43o --json
```
**Validate**: Response contains resource usage metrics. Check that the output is valid JSON with expected fields.

#### D6: Runtime List
```bash
agentuity cloud sandbox runtime list --json
```
**Validate**: Response contains a `runtimes` array with at least one entry. Each entry should have `id` and `name` fields.

---

### Category E: Checkpoint Operations (pick 1+)

#### E1: Create and List Checkpoints
```bash
agentuity cloud sandbox exec <sandboxId> --json -- sh -c "echo 'checkpoint-data' > /home/agentuity/checkpoint-test.txt"
agentuity cloud sandbox checkpoint create <sandboxId> "test-ckpt-1" --json
agentuity cloud sandbox checkpoint list <sandboxId> --json
```
**Validate**: Checkpoint appears in list with correct name.

#### E2: Checkpoint Restore Verification
```bash
# Create a file and checkpoint
agentuity cloud sandbox exec <sandboxId> --json -- sh -c "echo 'before-checkpoint' > /home/agentuity/restore-test.txt"
agentuity cloud sandbox checkpoint create <sandboxId> "restore-point" --json

# Modify the file
agentuity cloud sandbox exec <sandboxId> --json -- sh -c "echo 'after-checkpoint' > /home/agentuity/restore-test.txt"

# Verify file was modified
agentuity cloud sandbox exec <sandboxId> --json -- cat /home/agentuity/restore-test.txt

# Restore checkpoint
agentuity cloud sandbox checkpoint restore <sandboxId> "restore-point" --json

# Verify file is back to original
agentuity cloud sandbox exec <sandboxId> --json -- cat /home/agentuity/restore-test.txt
```
**Validate**: After restore, file content should be `before-checkpoint`, not `after-checkpoint`.

#### E3: Multiple Checkpoints
```bash
agentuity cloud sandbox exec <sandboxId> --json -- sh -c "echo 'v1' > /home/agentuity/version.txt"
agentuity cloud sandbox checkpoint create <sandboxId> "v1" --json

agentuity cloud sandbox exec <sandboxId> --json -- sh -c "echo 'v2' > /home/agentuity/version.txt"
agentuity cloud sandbox checkpoint create <sandboxId> "v2" --json

agentuity cloud sandbox checkpoint list <sandboxId> --json
```
**Validate**: Both checkpoints `v1` and `v2` appear in list.

#### E4: Checkpoint Delete
```bash
agentuity cloud sandbox exec <sandboxId> --json -- sh -c "echo 'disposable' > /home/agentuity/disposable.txt"
agentuity cloud sandbox checkpoint create <sandboxId> "delete-me-ckpt" --json
agentuity cloud sandbox checkpoint delete <sandboxId> "delete-me-ckpt" --confirm --json
agentuity cloud sandbox checkpoint list <sandboxId> --json
```
**Validate**: Checkpoint `delete-me-ckpt` no longer appears in list after deletion.

---

### Category F: Edge Cases & Stress Tests (pick 1+)

#### F1: Rapid Sequential Executions
Run 5 commands in quick succession:
```bash
for i in 1 2 3 4 5; do
  agentuity cloud sandbox exec <sandboxId> --region $REGION --json -- echo "rapid-$i"
done
```
**Validate**: All 5 complete successfully with correct output. No race conditions or dropped commands.

#### F2: Large File Write and Read
```bash
agentuity cloud sandbox exec <sandboxId> --json -- sh -c "dd if=/dev/urandom bs=1024 count=1024 2>/dev/null | base64 > /home/agentuity/largefile.txt"
agentuity cloud sandbox files <sandboxId> /home/agentuity --long --json
```
**Validate**: File exists with size approximately 1.4MB (1MB binary base64-encoded).

#### F3: Deeply Nested Path Operations
```bash
agentuity cloud sandbox mkdir <sandboxId> /home/agentuity/a/b/c/d/e/f/g/h/i/j --parents --json
agentuity cloud sandbox exec <sandboxId> --json -- sh -c "echo 'deep' > /home/agentuity/a/b/c/d/e/f/g/h/i/j/file.txt"
agentuity cloud sandbox exec <sandboxId> --json -- cat /home/agentuity/a/b/c/d/e/f/g/h/i/j/file.txt
```
**Validate**: File can be created and read 10 levels deep.

#### F4: Non-Existent Path Listing
```bash
agentuity cloud sandbox files <sandboxId> /nonexistent/path/that/doesnt/exist --json
```
**Validate**: Returns a clear error message, not a crash or empty success.

#### F5: Remove Non-Existent File
```bash
agentuity cloud sandbox rm <sandboxId> /home/agentuity/this-file-does-not-exist.txt --json
```
**Validate**: Returns an error. PASS if error is clear. FAIL if silent success or crash.

#### F6: Directory Operations Without Flags
```bash
# Try to remove a non-empty directory WITHOUT --recursive
agentuity cloud sandbox exec <sandboxId> --json -- sh -c "mkdir -p /home/agentuity/nonempty && touch /home/agentuity/nonempty/file.txt"
agentuity cloud sandbox rmdir <sandboxId> /home/agentuity/nonempty --json
```
**Validate**: Should fail with a clear error since directory is not empty and `--recursive` was not used.

#### F7: Network Connectivity Test
```bash
agentuity cloud sandbox exec <sandboxId> --json -- sh -c "curl -s -o /dev/null -w '%{http_code}' https://httpbin.org/get || echo 'curl-failed'"
```
**Validate**: Since sandbox was created with `--network`, this should return HTTP 200. If curl is not available, the test is inconclusive (not a failure).

#### F8: Binary/Non-UTF8 in File Content
```bash
agentuity cloud sandbox exec <sandboxId> --json -- sh -c "printf '\\x00\\x01\\x02' > /home/agentuity/binary.bin"
agentuity cloud sandbox files <sandboxId> /home/agentuity --long --json
```
**Validate**: File exists. File listing does not crash when binary files are present.

---

### Category G: Snapshot Operations (pick 0-1, optional)

#### G1: Create and List Snapshot
```bash
agentuity cloud sandbox exec <sandboxId> --json -- sh -c "echo 'snapshot-content' > /home/agentuity/snapshot-file.txt"
agentuity cloud sandbox snapshot create <sandboxId> --name "fuzz-test-snap" --tag "test-run" --json
agentuity cloud sandbox snapshot list --json
```
**Validate**: Snapshot appears in list with correct name and tag. Capture `snapshotId` from the create response.

**IMPORTANT**: If selected, also clean up the snapshot during teardown:
```bash
agentuity cloud sandbox snapshot delete <snapshotId> --confirm --json
```

#### G2: Get Snapshot Details
After creating a snapshot (requires G1 first, or create one inline):
```bash
agentuity cloud sandbox snapshot get <snapshotId> --json
```
**Validate**: Response contains `snapshotId`, `name`, `tag`, `sizeBytes`, `fileCount`, `createdAt`.

**NOTE**: If you select G2, you must also select G1 to create the snapshot first. If G1 was not selected, create a snapshot inline before running G2.

---

## Phase 5: File Bugs & Enhancements

During action execution (Phase 4), **collect** all bugs and enhancements into lists but do **NOT** file them immediately. Each collected item should retain all the information needed for filing (title, description, priority, metadata). Only file them here in Phase 5 after all actions have been executed (or after the first failure causes early stop).

### Step 1: Check if there are issues to file

Count the total number of bugs and enhancements collected during testing. If the total is **0** (no bugs and no enhancements), **skip this entire phase** — do not create any issues at all (no parent issue, no child issues).

### Step 2: Create the parent tracking task

If there are >0 issues to report, first create a **parent task** (type `epic`) to track the entire testing session:

```bash
agentuity cloud task create "Sandbox Fuzz Test Session: <DATE> - <TOTAL_ISSUES> issues found" \
  --org-id org_2u8RgDTwcZWrZrZ3sZh24T5FCtz \
  --type epic \
  --priority medium \
  --created-type agent \
  --created-name "sandbox-fuzz-tester" \
  --tag sandbox \
  --description "## Sandbox Fuzz Test Session

**Date**: <date>
**Region**: $REGION (<region name>)
**Random Seed**: $SEED
**Sandbox ID**: <sandboxId>
**Runtime**: <runtime>

### Summary

- **Bugs found**: <N_BUGS>
- **Enhancements found**: <N_ENHANCEMENTS>
- **Total issues**: <TOTAL_ISSUES>

### Child Issues

_Will be updated after all child tasks are filed._" \
  --metadata '{"source":"sandbox-fuzz-test","sandbox_id":"<SANDBOX_ID>","runtime":"<RUNTIME>","region":"<REGION>","seed":"<SEED>"}' \
  --json
```

Capture the `task.id` from the JSON response (e.g., `task_abc123`). Store this as `PARENT_TASK_ID` for use in subsequent steps.

### Step 3: File individual bugs

For every failed action collected during testing:

1. Construct the title: `[sandbox-fuzz] <Category>: <short description>`
2. Determine priority from the Bug Priority Rules table
3. Construct the description with the reproduction report format
4. Construct the metadata JSON with `tags: ["sandbox"]`, action_id, category, sandbox_id, runtime, region, seed
5. Run the `agentuity cloud task create` command with `--type bug --parent-id <PARENT_TASK_ID>`
6. Capture the `task.id` from the response
7. If task creation fails, log the failure but continue

### Step 4: File individual enhancements

For improvement opportunities noticed during testing:

1. Construct the title: `[sandbox-fuzz] Enhancement: <short description>`
2. Construct the description with the observation format
3. Run the `agentuity cloud task create` command with `--type enhancement --priority low --parent-id <PARENT_TASK_ID>`
4. Capture the `task.id` from the response

### Step 5: Update the parent task with child links

After ALL child bugs and enhancements have been filed, update the parent task description to include a list of all children:

```bash
agentuity cloud task update <PARENT_TASK_ID> \
  --org-id org_2u8RgDTwcZWrZrZ3sZh24T5FCtz \
  --description "## Sandbox Fuzz Test Session

**Date**: <date>
**Region**: $REGION (<region name>)
**Random Seed**: $SEED
**Sandbox ID**: <sandboxId>
**Runtime**: <runtime>

### Summary

- **Bugs found**: <N_BUGS>
- **Enhancements found**: <N_ENHANCEMENTS>
- **Total issues**: <TOTAL_ISSUES>

### Child Issues

- [`task_abc123`](https://app.agentuity.com/services/task/task_abc123) — [sandbox-fuzz] Files: cp round-trip content mismatch (bug, high)
- [`task_def456`](https://app.agentuity.com/services/task/task_def456) — [sandbox-fuzz] Edge: rm non-existent file returns success (bug, medium)
- [`task_ghi789`](https://app.agentuity.com/services/task/task_ghi789) — [sandbox-fuzz] Enhancement: error message should include path (enhancement, low)"
```

Each line in the **Child Issues** list follows this format:
```
- [`<task_id>`](https://app.agentuity.com/services/task/<task_id>) — <title> (<type>, <priority>)
```

### Post-teardown probe bugs

**Also collect bugs from the post-teardown probe** (Phase 7) if it fails. If the parent task was already created (i.e., there were bugs/enhancements from Phase 4), file the post-teardown bug using Step 3 with the same `PARENT_TASK_ID`, then re-run Step 5 to update the parent with the additional child link.

If no parent task exists yet (Phase 4 found 0 issues but the post-teardown probe fails), create the parent task (Step 2) first, then file the bug (Step 3), then update the parent (Step 5).

## Phase 6: Teardown

**ALWAYS run this, even if tests failed:**

First, resume the sandbox in case it was paused (best-effort):
```bash
agentuity cloud sandbox resume <sandboxId> --region $REGION --json 2>/dev/null || true
```

Then delete:
```bash
agentuity cloud sandbox delete <sandboxId> --region $REGION --confirm --json
```

If a snapshot was created (Category G), also delete it:
```bash
agentuity cloud sandbox snapshot delete <snapshotId> --region $REGION --confirm --json
```

Verify the delete succeeded. If delete fails, report it as an additional issue but do not retry indefinitely.

Clean up local temp files:
```bash
rm -f /tmp/sandbox-test-upload.txt /tmp/sandbox-test-download.txt /tmp/sandbox-empty-file.txt /tmp/sandbox-b7-upload.txt
```

## Phase 7: Post-Teardown Probe

After teardown is complete, verify that operations on the deleted sandbox return clean errors:

```bash
agentuity cloud sandbox exec <sandboxId> --region $REGION --json -- echo "should fail"
```
**Validate**: Returns a clear error (not crash, not stack trace). Record as PASS/FAIL in the report. If this fails, file a bug using the standard bug reporting flow. This is always executed (not randomly selected).

## Phase 8: Report

Output the final report in this exact format:

```markdown
## Sandbox Fuzz Test Results

**Status**: SUCCESS | FAILURE
**Sandbox ID**: <sandboxId>
**Runtime**: <runtime used>
**Region**: <REGION> (<region name>)
**Test Org**: org_38uEd1JNXIe89KMPaOwx1WJW43o
**Orphans Cleaned Up**: N (across all regions)
**Actions Attempted**: N / 10
**Actions Passed**: N
**Actions Failed**: N
**Bugs Filed**: N
**Enhancements Filed**: N
**Parent Task**: [<PARENT_TASK_ID>](https://app.agentuity.com/services/task/<PARENT_TASK_ID>) _(or "None — no issues found")_
**Random Seed**: <seed>

### Orphan Cleanup

| Region | Sandboxes Found | Deleted | Failed |
|--------|-----------------|---------|--------|
| usw | N | N | N |
| usc | N | N | N |
| use | N | N | N |

_(Omit this section if no orphans were found)_

### Actions Executed

| # | Action ID | Category | Description | Result | Duration |
|---|-----------|----------|-------------|--------|----------|
| 1 | A3 | Execution | Multi-command pipeline | PASS | 2.1s |
| 2 | B2 | Files | File copy round-trip | FAIL | 3.4s |
| ... | ... | ... | ... | ... | ... |

### Post-Teardown Probe

| Check | Result | Details |
|-------|--------|---------|
| Exec on deleted sandbox returns clean error | PASS/FAIL | [error message or issue] |

### Bugs Filed

| Task ID | Action | Priority | Title |
|---------|--------|----------|-------|
| [task_abc123](https://app.agentuity.com/services/task/task_abc123) | B2 | high | [sandbox-fuzz] Files: cp round-trip content mismatch |
| [task_def456](https://app.agentuity.com/services/task/task_def456) | F5 | medium | [sandbox-fuzz] Edge: rm non-existent file returns success |

### Enhancements Filed

| Task ID | Action | Title |
|---------|--------|-------|
| [task_ghi789](https://app.agentuity.com/services/task/task_ghi789) | F4 | [sandbox-fuzz] Enhancement: error message should include attempted path |

### Failures (detail)

#### [Action ID]: [Description]
- **Task ID**: [<task_id>](https://app.agentuity.com/services/task/<task_id>)
- **Session ID**: <sess_xxx if present, otherwise omit>
- **Command(s)**: The exact commands that were run
- **Expected**: What should have happened
- **Actual**: What actually happened
- **Exit Code**: Reported exit code
- **Error Output**: Any error messages

### Edge Cases Discovered

[List any surprising behaviors that didn't warrant a bug or enhancement but are worth noting]

### Summary

[2-3 sentence summary: what was tested, whether issues were found, how many bugs and enhancements were filed, and any recommendations]
```

## Variation Guide

To maximize bug discovery across multiple runs, vary these aspects:

- **Region**: Randomly selected each run — tests all three regions over time
- **Action selection**: Never pick the same 10 actions twice
- **Parameter values**: Use different filenames, directory paths, env var names/values
- **Ordering**: Run file ops before exec sometimes, env before files other times
- **Timing**: Sometimes pause between actions, sometimes run rapidly
- **Edge case focus**: Some runs focus on file ops edge cases, others on execution edge cases
- **Resource options**: Vary `--memory`, `--cpu`, `--disk` on sandbox creation between runs
- **Runtime selection**: Use `bun:1` for some runs, try `python:3.14` or `node:22` for others if available

## What Constitutes a Bug

Report as **FAILURE** (file a bug task) if:
- CLI crashes (non-JSON error output, stack traces, segfaults)
- Exit code is wrong (reports 0 when command failed, or non-zero when it succeeded)
- JSON response is malformed or missing expected fields
- Data corruption (file content changed during copy, env var value mangled)
- State inconsistency (checkpoint restore doesn't restore, delete doesn't delete)
- Silent failures (operation fails but no error reported)
- Timeout with no explanation
- Sandbox becomes unresponsive after a valid operation

Report as **PASS** and **file an enhancement** if:
- Error messages are vague but behavior is correct
- Operations are unusually slow (>30s for simple commands)
- Output format is inconsistent between similar commands
- Warnings appear but operation succeeds
- A common workflow is more cumbersome than it needs to be
- Missing information in responses that would help the user
