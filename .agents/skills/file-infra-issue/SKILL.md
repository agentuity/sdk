---
name: file-infra-issue
description: File a bug or enhancement on the agentuity/infra repo when the SDK's behavior is being broken or made worse by something on the platform side (Catalyst, Sandbox runtime, Ion, Gluon, Hadron, region routing, auth surfaces). Use this when an SDK debugging session ends with "this is the platform's fault, not ours" — unhelpful error messages from the API, opaque 5xx responses, behavior that contradicts the docs, missing capabilities the SDK is documented to expose. Always checks for duplicates first and refuses to file if the issue is actually an SDK bug.
---

# File Infra Issue

When the SDK is breaking because of an infra-side problem (bad error responses, missing endpoints, misrouting, unauthorized where authorized was expected, etc.), file a clean, deduplicated issue on `agentuity/infra`.

## When to use this skill

Use it when **all** of the following are true:

1. You hit a real failure (CI red, smoke test red, manual repro red), and
2. The root cause sits on the **platform side** — Catalyst HTTP API, sandbox runtime images, Ion, Gluon, Hadron, region routing, auth/permission surfaces — not in SDK code, and
3. The fix has to happen in `agentuity/infra` (or its downstream services), not in this repo.

Concrete examples that qualify:

- The API returns `500 Internal Server Error` for a user-input error that should be a structured 4xx.
- An endpoint returns `401 Unauthorized` when the resource simply doesn't exist (should be `404`).
- The SDK is documented to use SDK-key auth, but the endpoint silently rejects SDK keys and only accepts CLI tokens.
- A sandbox runtime image is missing a binary the docs claim it ships.
- An endpoint requires the caller to supply a piece of state (region, project id) that the platform should be able to resolve from existing context.
- Error responses are missing context the user needs to debug (no session id, empty stderr, no message body).
- Cross-region routing falls back in a confusing way (e.g., wrong host returns 401 instead of 421 misdirected).

## When NOT to use this skill

Refuse / suggest a different action if:

- The bug is in **SDK code** (wrong types, bad URL construction, wrong header name on the SDK side, schema mismatch in our zod definitions, etc.) — fix it in this repo instead.
- The "issue" is actually a **feature request** for the SDK that the platform already supports — file it on `agentuity/sdk` (or just implement it).
- The behavior is **as documented** in the platform's own contract — the SDK is the wrong layer to be surprised by it; either update the SDK to match or update SDK docs.
- You only **suspect** it's infra but haven't confirmed (e.g., didn't curl the endpoint directly, didn't compare against CLI behavior, didn't check whether SDK code is constructing a bad request). Confirm first.
- The platform behavior is annoying but **intentional** (e.g., SDK keys can't list all orgs by design — that's an auth-model decision, not a bug).

If unsure, prefer **not filing**. Duplicates and noise in `agentuity/infra` cost the team more than missing a marginal report.

## Workflow

### 1. Confirm it's actually infra

Before doing anything else, answer all of these in writing (in your reasoning, not in the issue):

- What does the SDK code do? (Read it. Don't guess.)
- What does the platform return? (Reproduce with `curl` or a minimal script — not via the SDK — so the SDK isn't a confounding variable.)
- Does the same call work from another client (CLI, browser, raw curl with a different token)? If yes, what's different?
- Is there a documented contract (in `docs/`, the openapi spec, the platform's own README) that the platform is violating? Or are you the one who made an assumption?

If after answering these you can't write **one sentence** describing what the platform should do differently, stop. The issue isn't ready.

### 2. Check for duplicates

Run **all three** searches before drafting. Different keyword sets catch different existing issues.

```bash
# Open issues, broad keyword
gh issue list --repo agentuity/infra --state open --search "<short-keyword-from-symptom>" --limit 20 \
  --json number,title,state,labels,updatedAt

# Closed issues, same keyword (catches "fixed but still broken" cases)
gh issue list --repo agentuity/infra --state closed --search "<short-keyword-from-symptom>" --limit 10 \
  --json number,title,state,labels,closedAt

# Component-scoped search (catalyst | sandbox | ion | gluon | hadron)
gh issue list --repo agentuity/infra --state all --search "<component>" --limit 30 \
  --json number,title,state,updatedAt
```

For each candidate, run `gh issue view <number> --repo agentuity/infra` and decide:

- **Exact dupe** — don't file. Add a comment on the existing issue with the new repro, the new failing CI run link, or any extra detail you have. Use `gh issue comment <number> --repo agentuity/infra --body-file ...`.
- **Related but distinct** — file the new one and reference the related issue with `Related: agentuity/infra#NNN` near the top of the body.
- **Closed but you're hitting it again** — comment on the closed issue with the fresh repro and ask whether it should be reopened. Don't open a new one until that's been answered.

### 3. Pick a label

Match the symptom to the closest existing label (run `gh label list --repo agentuity/infra` if unsure):

| Symptom | Label |
|---|---|
| Bad / unhelpful behavior, wrong status codes, broken endpoints | `bug` |
| Missing endpoint / capability the SDK needs | `enhancement` |
| Sandbox runtime, sandbox API, runtime images | (no specific label exists yet — use `bug` or `enhancement` and put `Sandbox:` in the title) |
| Catalyst HTTP routing, region routing, auth surface | `bug` (or `enhancement` for new endpoints) |
| Ion-specific | `Ion` |
| Gluon-specific | `gluon` |
| Hadron-specific | `hadron` |
| Production outage right now | `outage` (only if it's actively broken in prod, not just CI) |

If multiple apply, use multiple. Don't invent new labels.

### 4. Write the issue

Use this structure. Keep it short — engineers who triage these issues are busy. Aim for under 60 lines of body.

```markdown
## Problem

<One paragraph. What does the platform do, and why is that wrong from the SDK's perspective? Be specific about endpoint, status codes, response shape.>

## Reproduction

<Minimal reproduction. Prefer raw `curl` so the SDK isn't a variable. Include the exact URL, method, headers (mask tokens), and the response status + body.>

```bash
curl -sS -i "https://catalyst-usc.agentuity.cloud/<endpoint>" \
  -H "Authorization: Bearer <ck_live_...>" \
  -H "Accept: application/json"
# → HTTP/2 <status>
# → <body>
```

## What we'd want instead

<One short paragraph or a numbered list. Concrete: status code, response shape, behavior. Don't write essays — bullet points beat prose here.>

## Why this matters

<One short paragraph. What SDK code path / user workflow is broken because of this? Link the failing CI run, the SDK file, the docs page that contradicts the current behavior.>

## References

- SDK code: <link to file on github.com/agentuity/sdk at the current branch>
- Failing run / repro: <link>
- Related: agentuity/infra#NNN  _(only if there's a related-but-distinct issue)_
```

Style rules:

- **No essays.** If the body is over ~60 lines, you're padding.
- **No SDK debugging narrative.** They don't need to read your debugging session — they need the platform-facing facts.
- **No "this is urgent" / "P0" framing** unless it's an actual prod outage. Use the `outage` label instead.
- **Mask tokens.** Replace real `ck_live_...` values with `<ck_live_...>` placeholders.
- **Title format**: `<Component>: <short symptom>`. Examples:
  - `Catalyst: DB endpoints should resolve region server-side`
  - `Sandbox: unhelpful errors when spawning a missing binary (500 from createJob, empty stderr from execute)`
  - `Catalyst: 401 Unauthorized for missing resources should be 404`

### 5. File it

Write the body to a tempfile, then create:

```bash
gh issue create \
  --repo agentuity/infra \
  --title "<Component>: <short symptom>" \
  --body-file /tmp/infra-issue.md \
  --label bug   # or enhancement, or both
```

Capture the URL from the response. Reference it in:

- The CI workflow comment that gates the failing test off (so future readers see the link)
- The relevant SDK source file's comments (so future maintainers see why something looks weird)
- Any tracking memory / project doc

### 6. Loop back into the SDK

If you gated a test off / added a workaround / hardcoded a value because of the platform issue, leave a code comment that:

1. Explains what's currently broken on the platform side.
2. Links the infra issue.
3. Describes how to revert the workaround once the issue is fixed.

Example:

```yaml
# Disabled: SDK keys can't currently auth against DB /resource endpoints.
# See agentuity/infra#120. Re-enable by removing this `if: false` once the
# issue is closed.
if: false
```

## Scope guard

Before filing, ask one last time: _"If a backend engineer reads this issue, will they immediately know what's broken, where it is, and what to change?"_ If not, the issue isn't ready — keep iterating before filing.
