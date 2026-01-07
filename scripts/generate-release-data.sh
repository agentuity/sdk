#!/bin/bash
# Generate release data between two tags in JSON format
# Usage: ./generate-release-data.sh <from-tag> [to-tag]
# If to-tag is not provided, uses the latest release

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$SDK_ROOT"

# Parse arguments
FROM_TAG="$1"
TO_TAG="$2"

if [ -z "$FROM_TAG" ]; then
	echo "Usage: $0 <from-tag> [to-tag]" >&2
	echo "  from-tag: The starting release tag (required)" >&2
	echo "  to-tag:   The ending release tag (optional, defaults to latest release)" >&2
	exit 1
fi

# If TO_TAG is not provided, get the latest release
if [ -z "$TO_TAG" ]; then
	TO_TAG=$(gh release view --json tagName -q '.tagName' 2>/dev/null || echo "")
	if [ -z "$TO_TAG" ]; then
		echo "Error: Could not determine latest release tag" >&2
		exit 1
	fi
	echo "Using latest release: $TO_TAG" >&2
fi

# Verify both tags exist
if ! git rev-parse "$FROM_TAG" >/dev/null 2>&1; then
	echo "Error: Tag '$FROM_TAG' does not exist" >&2
	exit 1
fi

if ! git rev-parse "$TO_TAG" >/dev/null 2>&1; then
	echo "Error: Tag '$TO_TAG' does not exist" >&2
	exit 1
fi

echo "Generating release data from $FROM_TAG to $TO_TAG..." >&2

# Get all merged PRs between the two tags
# We use the commit range and then find associated PRs
COMMITS=$(git log "$FROM_TAG".."$TO_TAG" --oneline --format="%H" 2>/dev/null)

if [ -z "$COMMITS" ]; then
	echo "No commits found between $FROM_TAG and $TO_TAG" >&2
	echo '{"from":"'"$FROM_TAG"'","to":"'"$TO_TAG"'","features":[],"enhancements":[],"bugFixes":[],"internal":[]}'
	exit 0
fi

# Temporary file for collecting PR data
TEMP_FILE=$(mktemp)
trap "rm -f $TEMP_FILE" EXIT

echo "[" > "$TEMP_FILE"
FIRST=true

# Get unique PR numbers from commits
PR_NUMBERS=$(git log "$FROM_TAG".."$TO_TAG" --oneline | grep -oE '#[0-9]+' | tr -d '#' | sort -u)

# Also try to find PRs via merge commits
MERGE_PR_NUMBERS=$(git log "$FROM_TAG".."$TO_TAG" --oneline | grep -oE 'Merge pull request #[0-9]+' | grep -oE '[0-9]+' | sort -u)

# Combine and deduplicate
ALL_PR_NUMBERS=$(echo -e "$PR_NUMBERS\n$MERGE_PR_NUMBERS" | grep -v '^$' | sort -u)

if [ -z "$ALL_PR_NUMBERS" ]; then
	# No PRs found, try to get PRs associated with commits
	for COMMIT in $COMMITS; do
		PR_DATA=$(gh pr list --state merged --search "$COMMIT" --json number -q '.[].number' 2>/dev/null || echo "")
		if [ -n "$PR_DATA" ]; then
			ALL_PR_NUMBERS=$(echo -e "$ALL_PR_NUMBERS\n$PR_DATA" | grep -v '^$' | sort -u)
		fi
	done
fi

# Fetch detailed PR data for each PR
for PR_NUM in $ALL_PR_NUMBERS; do
	if [ -z "$PR_NUM" ]; then
		continue
	fi

	# Fetch PR details
	PR_JSON=$(gh pr view "$PR_NUM" --json number,title,body,author,mergedAt,labels,url 2>/dev/null || echo "")
	
	if [ -z "$PR_JSON" ] || [ "$PR_JSON" = "null" ]; then
		continue
	fi

	# Extract fields
	TITLE=$(echo "$PR_JSON" | jq -r '.title // ""')
	BODY=$(echo "$PR_JSON" | jq -r '.body // ""')
	AUTHOR_NAME=$(echo "$PR_JSON" | jq -r '.author.login // ""')
	AUTHOR_URL="https://github.com/$AUTHOR_NAME"
	MERGED_AT=$(echo "$PR_JSON" | jq -r '.mergedAt // ""')
	PR_URL=$(echo "$PR_JSON" | jq -r '.url // ""')
	LABELS=$(echo "$PR_JSON" | jq -r '[.labels[].name] | join(",")' 2>/dev/null || echo "")

	# Skip if no merge date (not actually merged)
	if [ -z "$MERGED_AT" ] || [ "$MERGED_AT" = "null" ]; then
		continue
	fi

	# Skip release PRs (e.g., "Release 0.0.87")
	if echo "$TITLE" | grep -qE '^[rR]elease [0-9]+\.[0-9]+\.[0-9]+'; then
		echo "  Skipping release PR #$PR_NUM: $TITLE" >&2
		continue
	fi

	# Categorize based on title prefix and labels
	CATEGORY="internal"
	TITLE_LOWER=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]')
	LABELS_LOWER=$(echo "$LABELS" | tr '[:upper:]' '[:lower:]')

	if echo "$TITLE_LOWER" | grep -qE '^feat(\(|:|\!)' || echo "$LABELS_LOWER" | grep -qE 'feature|feat'; then
		CATEGORY="features"
	elif echo "$TITLE_LOWER" | grep -qE '^fix(\(|:|\!)' || echo "$LABELS_LOWER" | grep -qE 'bug|fix'; then
		CATEGORY="bugFixes"
	elif echo "$TITLE_LOWER" | grep -qE '^(enhance|improve|perf|refactor)(\(|:|\!)' || echo "$LABELS_LOWER" | grep -qE 'enhancement|improvement|performance'; then
		CATEGORY="enhancements"
	elif echo "$TITLE_LOWER" | grep -qE '^(chore|ci|docs|style|test|build)(\(|:|\!)' || echo "$LABELS_LOWER" | grep -qE 'chore|internal|maintenance'; then
		CATEGORY="internal"
	fi

	# Extract short title (remove conventional commit prefix)
	SHORT_TITLE=$(echo "$TITLE" | sed -E 's/^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|enhance|improve)(\([^)]*\))?[!]?:\s*//')
	if [ -z "$SHORT_TITLE" ]; then
		SHORT_TITLE="$TITLE"
	fi

	# Create description from body (first paragraph or first 500 chars)
	DESCRIPTION=$(echo "$BODY" | head -20 | tr '\n' ' ' | sed 's/  */ /g' | cut -c1-500)
	if [ ${#BODY} -gt 500 ]; then
		DESCRIPTION="${DESCRIPTION}..."
	fi

	# Escape for JSON
	SHORT_TITLE_ESCAPED=$(echo "$SHORT_TITLE" | jq -Rs '.' | sed 's/^"//;s/"$//')
	DESCRIPTION_ESCAPED=$(echo "$DESCRIPTION" | jq -Rs '.' | sed 's/^"//;s/"$//')

	# Add comma if not first
	if [ "$FIRST" = true ]; then
		FIRST=false
	else
		echo "," >> "$TEMP_FILE"
	fi

	# Write PR entry
	cat >> "$TEMP_FILE" << EOF
{
  "number": $PR_NUM,
  "url": "$PR_URL",
  "title": "$SHORT_TITLE_ESCAPED",
  "description": "$DESCRIPTION_ESCAPED",
  "author": {
    "name": "$AUTHOR_NAME",
    "url": "$AUTHOR_URL"
  },
  "date": "$MERGED_AT",
  "category": "$CATEGORY"
}
EOF

	echo "  Processed PR #$PR_NUM ($CATEGORY)" >&2
done

echo "]" >> "$TEMP_FILE"

# Read all PRs and categorize into final structure
ALL_PRS=$(cat "$TEMP_FILE")

# Build final JSON output using jq
jq -n \
	--arg from "$FROM_TAG" \
	--arg to "$TO_TAG" \
	--argjson prs "$ALL_PRS" \
	'{
		from: $from,
		to: $to,
		generatedAt: (now | strftime("%Y-%m-%dT%H:%M:%SZ")),
		features: [($prs[] | select(.category == "features") | del(.category))],
		enhancements: [($prs[] | select(.category == "enhancements") | del(.category))],
		bugFixes: [($prs[] | select(.category == "bugFixes") | del(.category))],
		internal: [($prs[] | select(.category == "internal") | del(.category))]
	}'

echo "" >&2
echo "Done!" >&2
