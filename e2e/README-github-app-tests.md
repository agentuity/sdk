# GitHub App Integration Test Plan

## Overview

End-to-end tests for the GitHub App integration, covering OAuth account connection, repository linking, and deployment triggers.

**Test Project:** `apps/testing/github-app-test-project`  
**Target Org:** `org_2u8RgDTwcZWrZrZ3sZh24T5FCtz`  
**GitHub Repo:** `https://github.com/agentuity-gh-app-tester/github-app-test-project.git`

## Environment Variables

```
GITHUB_TEST_ACC_USERNAME   # Test GitHub account username
GITHUB_TEST_ACC_PASSWORD   # Test GitHub account password (no 2FA)
GITHUB_TEST_ACC_TOKEN      # Personal Access Token with repo write access
```

---

## Test Suites

### 1. Account Management (`git account`)

#### 1.1 Connect GitHub Account via OAuth ✅ (implemented)

- Start OAuth flow via `git account add --org <org> --url-only`
- Login to GitHub with test credentials
- Authorize the Agentuity GitHub App
- Verify connection via `git account list`

#### 1.2 List Connected Accounts

- Run `git account list --json`
- Verify response contains connected integrations
- Verify integration has correct `githubAccountName` and `githubAccountType`

#### 1.3 Disconnect GitHub Account ✅ (implemented)

- Get integration ID from `git account list` for the test account only
- Run `git account remove --org <org> --account <id> --confirm`
- Verify test account no longer appears in list
- **Important:** Only disconnect the account connected by this test run (match by `GITHUB_USERNAME`)

---

### 2. Repository Linking (`git link/unlink`)

#### 2.1 Link Project to Repository

- Ensure GitHub account is connected (prerequisite)
- Run `git link --repo agentuity-gh-app-tester/github-app-test-project --branch main --confirm`
- Verify link via `git status`
- Verify `linked: true` and correct `repoFullName`

#### 2.2 Git Status Check

- Run `git status --json`
- Verify org-level `connected: true`
- Verify `integrations` array contains connected accounts
- Verify project-level `linked`, `repoFullName`, `branch`, `autoDeploy`, `previewDeploy`

#### 2.3 List Accessible Repositories

- Run `git list --org <org> --json`
- Verify returns array of repos with `fullName`, `defaultBranch`, `private`
- Verify test repo appears in list

#### 2.4 Unlink Project from Repository

- Ensure project is linked (prerequisite)
- Run `git unlink --confirm`
- Verify `git status` shows `linked: false`

#### 2.5 Re-link with Different Settings

- Link with `--deploy false --preview false`
- Verify `autoDeploy: false` and `previewDeploy: false`
- Re-link with `--deploy true --preview true`
- Verify settings updated

---

### 3. Git Detection (`--detect` flag)

#### 3.1 Auto-detect Repository from Origin

- Init git repo with origin pointing to test repo
- Run `git link --detect --confirm`
- Verify repo auto-detected from git origin
- Verify link succeeds without specifying `--repo`

#### 3.2 Auto-detect Branch

- Checkout specific branch in local git repo
- Run `git link --detect --confirm`
- Verify branch auto-detected from current HEAD
- Verify link uses detected branch

#### 3.3 Detection Failure

- Run `git link --detect --confirm` in directory without git origin
- Verify appropriate error message about missing origin

---

### 4. Deployment Triggers (Future)

#### 4.1 Push-triggered Deployment

- Link project with `autoDeploy: true`
- Push commit to linked branch
- Verify deployment triggered
- Verify deployment completes successfully

#### 4.2 PR Preview Deployment

- Link project with `previewDeploy: true`
- Create PR against linked branch
- Verify preview deployment triggered
- Verify preview URL returned

#### 4.3 Monorepo Support

- Link with `--root packages/my-agent`
- Push changes only to that directory
- Verify deployment triggered only for directory changes

---

### 5. Error Handling

#### 5.1 No GitHub Connection

- Disconnect all accounts
- Run `git link`
- Verify prompts to connect account

#### 5.2 No Repos Found

- Connect account with no repo access
- Run `git list`
- Verify appropriate error message

#### 5.3 Already Linked

- Link project to repo
- Run `git link` again
- Verify prompts about existing link

#### 5.4 Invalid Repo

- Run `git link --repo invalid/nonexistent --confirm`
- Verify appropriate error

---

## Test Execution Order

Tests run in serial mode to maintain state:

1. **Setup:** `beforeAll` - Init git repo in test project
2. **Connect:** OAuth flow to connect GitHub account
3. **Link:** Link project to repository
4. **Verify:** Check status and list commands
5. **Modify:** Test settings changes
6. **Unlink:** Unlink project
7. **Cleanup:** `afterAll` - Remove .git directory, disconnect account

---

## Implementation Status

| Test                             | Status         |
| -------------------------------- | -------------- |
| Connect GitHub account via OAuth | ✅ Implemented |
| List connected accounts          | ✅ Implemented |
| List accessible repos            | ✅ Implemented |
| Link project with `--detect`     | ✅ Implemented |
| Git status check                 | ✅ Implemented |
| Unlink project                   | ✅ Implemented |
| Link with explicit repo/settings | ✅ Implemented |
| Re-link with settings            | ✅ Implemented |
| Push commit and revert via API   | ✅ Implemented |
| Disconnect GitHub account        | ✅ Implemented |
| Git repo init/cleanup            | ✅ Implemented |
| Push-triggered deployment        | ⬜ Future      |
| PR preview deployment            | ⬜ Future      |
| Error handling cases             | ⬜ Future      |

---

## Notes

- Test account must NOT have 2FA enabled
- Tests require network access to GitHub and Agentuity API
- Git repo is initialized fresh each test run to avoid stale state
- Account disconnect only removes the account connected by this test (matched by `GITHUB_USERNAME`)
- Pre-existing GitHub integrations in the org are left untouched
