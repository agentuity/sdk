---
name: coderabbit-conversations
description: List and resolve all unresolved CodeRabbit review conversations from the current PR
version: '1.0.0'
license: Apache-2.0
allowed-tools: 'Bash,Read,edit_file,todo_write'
metadata:
   command: 'gh api graphql'
   tags: 'github pr review coderabbit'
---

# CodeRabbit Conversations

List all unresolved CodeRabbit review conversations from the current PR, create a TODO list to address each one, and resolve them all once fixed.

## Why GraphQL Instead of REST

The `gh pr view --json reviews,comments` approach only returns review-level data and misses individual conversation threads. GitHub's GraphQL API exposes the `reviewThreads` connection which gives us:

- Per-thread resolution status (`isResolved`)
- Whether the comment is outdated/outside diff (`isOutdated`)
- The exact file path and line number
- The full comment body
- Thread IDs needed for the `resolveReviewThread` mutation

## Workflow

### Step 1: Get Current PR Info

```bash
PR_JSON=$(gh pr view --json number,url,title --jq '{number,url,title}')
PR_NUMBER=$(echo "$PR_JSON" | jq -r '.number')
PR_TITLE=$(echo "$PR_JSON" | jq -r '.title')
PR_URL=$(echo "$PR_JSON" | jq -r '.url')
```

### Step 2: Get Repository Owner and Name

```bash
REPO_JSON=$(gh repo view --json owner,name --jq '{owner: .owner.login, name: .name}')
OWNER=$(echo "$REPO_JSON" | jq -r '.owner')
REPO=$(echo "$REPO_JSON" | jq -r '.name')
```

### Step 3: Fetch All CodeRabbit Review Threads

Fetch all review threads from the PR using GitHub's GraphQL API with cursor-based pagination (PRs may have >100 threads). This collects every conversation thread with its resolution status, outdated status, file path, line number, and comment body into `$ALL_THREADS`.

```bash
ALL_THREADS='[]'
HAS_NEXT=true
CURSOR=""

while [ "$HAS_NEXT" = "true" ]; do
  AFTER_CLAUSE=""
  if [ -n "$CURSOR" ]; then
    AFTER_CLAUSE=", after: \"$CURSOR\""
  fi

  RESPONSE=$(gh api graphql -f query='
  {
    repository(owner: "'"$OWNER"'", name: "'"$REPO"'") {
      pullRequest(number: '"$PR_NUMBER"') {
        reviewThreads(first: 100'"$AFTER_CLAUSE"') {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            isResolved
            isOutdated
            comments(first: 1) {
              nodes {
                author { login }
                path
                line
                body
              }
            }
          }
        }
      }
    }
  }')

  HAS_NEXT=$(echo "$RESPONSE" | jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.hasNextPage')
  CURSOR=$(echo "$RESPONSE" | jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.endCursor')
  PAGE_NODES=$(echo "$RESPONSE" | jq '.data.repository.pullRequest.reviewThreads.nodes')
  ALL_THREADS=$(echo "$ALL_THREADS" "$PAGE_NODES" | jq -s '.[0] + .[1]')
done

TOTAL=$(echo "$RESPONSE" | jq -r '.data.repository.pullRequest.reviewThreads.totalCount')
echo "Fetched $(echo "$ALL_THREADS" | jq 'length') of $TOTAL total threads"
```

### Step 4: Filter and Format

From the collected `$ALL_THREADS` array, apply these filters:

1. **Unresolved only**: `isResolved == false`
2. **CodeRabbit only**: `comments.nodes[0].author.login == "coderabbitai"`
3. **In-diff only**: `isOutdated == false` (excludes "outside diff range" comments)

Then format as a flat numbered list using jq:

```bash
echo "$ALL_THREADS" | jq -r '
  [.[]
   | select(.isResolved == false)
   | select(.isOutdated == false)
   | select(.comments.nodes[0].author.login == "coderabbitai")
  ] | to_entries[]
  | "\(.key + 1). [\(.value.id)] \(.value.comments.nodes[0].path):\(.value.comments.nodes[0].line // "N/A")\n   \(.value.comments.nodes[0].body | split("\n") | map(select(length > 0)) | join("\n   "))\n"
'
```

### Step 5: Create TODO List

After listing all unresolved conversations, use `todo_write` to create a TODO item for each one. Each TODO should include:

- The thread ID (for resolving later)
- The file path and line number
- A brief summary of the issue

Then work through each TODO:

1. Read the relevant file and understand the issue
2. Make the fix
3. Mark the TODO as completed
4. Move to the next one

### Step 6: Resolve All Conversations

After all issues have been fixed, resolve every thread by running the `resolveReviewThread` GraphQL mutation for each thread ID:

```bash
gh api graphql -f query='
mutation {
  resolveReviewThread(input: { threadId: "THREAD_ID_HERE" }) {
    thread {
      id
      isResolved
    }
  }
}'
```

To resolve all unresolved CodeRabbit threads in one go, first collect all thread IDs, then loop:

```bash
# Collect all unresolved CodeRabbit thread IDs with cursor-based pagination
ALL_RESOLVE_THREADS='[]'
HAS_NEXT=true
CURSOR=""

while [ "$HAS_NEXT" = "true" ]; do
  AFTER_CLAUSE=""
  if [ -n "$CURSOR" ]; then
    AFTER_CLAUSE=", after: \"$CURSOR\""
  fi

  RESPONSE=$(gh api graphql -f query='
  {
    repository(owner: "'"$OWNER"'", name: "'"$REPO"'") {
      pullRequest(number: '"$PR_NUMBER"') {
        reviewThreads(first: 100'"$AFTER_CLAUSE"') {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            isResolved
            isOutdated
            comments(first: 1) {
              nodes {
                author { login }
              }
            }
          }
        }
      }
    }
  }')

  HAS_NEXT=$(echo "$RESPONSE" | jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.hasNextPage')
  CURSOR=$(echo "$RESPONSE" | jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.endCursor')
  PAGE_NODES=$(echo "$RESPONSE" | jq '.data.repository.pullRequest.reviewThreads.nodes')
  ALL_RESOLVE_THREADS=$(echo "$ALL_RESOLVE_THREADS" "$PAGE_NODES" | jq -s '.[0] + .[1]')
done

THREAD_IDS=$(echo "$ALL_RESOLVE_THREADS" | jq -r '
  [.[]
   | select(.isResolved == false)
   | select(.isOutdated == false)
   | select(.comments.nodes[0].author.login == "coderabbitai")
   | .id
  ] | .[]
')

for THREAD_ID in $THREAD_IDS; do
  echo "Resolving $THREAD_ID..."
  gh api graphql -f query='
  mutation {
    resolveReviewThread(input: { threadId: "'"$THREAD_ID"'" }) {
      thread { id isResolved }
    }
  }'
done
```

## One-Liner: List All Unresolved Conversations

Copy-paste this to quickly list all unresolved CodeRabbit conversations for the current PR. This fetches the first 100 threads and warns if there are more (use the paginated Step 3 workflow above for PRs with >100 threads):

```bash
PR_NUMBER=$(gh pr view --json number --jq '.number') && REPO_INFO=$(gh repo view --json owner,name) && OWNER=$(echo "$REPO_INFO" | jq -r '.owner.login') && REPO=$(echo "$REPO_INFO" | jq -r '.name') && RESULT=$(gh api graphql -f query='{ repository(owner: "'"$OWNER"'", name: "'"$REPO"'") { pullRequest(number: '"$PR_NUMBER"') { reviewThreads(first: 100) { totalCount nodes { id isResolved isOutdated comments(first: 1) { nodes { author { login } path line body } } } } } } }') && TOTAL=$(echo "$RESULT" | jq -r '.data.repository.pullRequest.reviewThreads.totalCount') && FETCHED=$(echo "$RESULT" | jq '.data.repository.pullRequest.reviewThreads.nodes | length') && if [ "$TOTAL" -gt "$FETCHED" ]; then echo "⚠️  WARNING: PR has $TOTAL threads but only $FETCHED were fetched. Use the paginated workflow in Steps 3-4 to get all threads."; fi && echo "$RESULT" | jq -r '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false) | select(.isOutdated == false) | select(.comments.nodes[0].author.login == "coderabbitai")] | "Unresolved CodeRabbit conversations: \(length)\n", (to_entries[] | "\(.key + 1). [\(.value.id)] \(.value.comments.nodes[0].path):\(.value.comments.nodes[0].line // "N/A")\n   \(.value.comments.nodes[0].body | split("\n")[0:5] | join("\n   "))\n")'
```

## Guidelines

- Always fetch threads via GraphQL, not `gh pr view --json reviews` (which misses thread-level data)
- Only process unresolved, non-outdated threads from `coderabbitai`
- Create one TODO per conversation thread for tracking
- Fix all issues before resolving conversations
- Resolve conversations only after the code changes are committed
- Steps 3 and 6 use cursor-based pagination to handle PRs with >100 threads; the one-liner warns if threads are truncated
