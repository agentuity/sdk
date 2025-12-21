---
name: fetch-issue
description: Fetch a GitHub issue and generate a resolution plan
parameters:
  - name: issue
    description: The issue number or full GitHub issue URL
    required: true
---

# Fetch Issue Tool

Fetches details from a GitHub issue and generates a structured resolution plan.

## Usage

- `fetch-issue 123` - Fetch issue #123 from the default repo (agentuity/sdk)
- `fetch-issue https://github.com/owner/repo/issues/123` - Fetch from any repo

## Requirements

- GitHub CLI (`gh`) must be installed and authenticated
