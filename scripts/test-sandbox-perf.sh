#!/bin/bash
# Sandbox Run Performance Test
#
# Runs `agentuity cloud sandbox run -- true` N times and measures:
#   - Each individual run duration
#   - Min / Max / Mean / Median / P95 / P99 / Std Dev
#   - Success / Failure counts
#
# Usage:
#   bash scripts/test-sandbox-perf.sh [--runs N] [--concurrency N] [--json]
#
# Options:
#   --runs N         Number of iterations (default: 100)
#   --concurrency N  Max parallel runs (default: 1, sequential)
#   --json           Output final stats as JSON
#
# Requirements:
#   - Authenticated CLI (agentuity auth login)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLI="${AGENTUITY_CLI:-agentuity}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Defaults
RUNS=100
CONCURRENCY=1
JSON_OUTPUT=false
ORG_ID="${AGENTUITY_CLOUD_ORG_ID:-}"
REGION="${AGENTUITY_REGION:-}"

# Parse arguments
while [[ $# -gt 0 ]]; do
	case "$1" in
		--runs)
			RUNS="$2"
			shift 2
			;;
		--concurrency)
			CONCURRENCY="$2"
			shift 2
			;;
		--org|--org-id)
			ORG_ID="$2"
			shift 2
			;;
		--region)
			REGION="$2"
			shift 2
			;;
		--json)
			JSON_OUTPUT=true
			shift
			;;
		-h|--help)
			echo "Usage: $0 [--runs N] [--concurrency N] [--org ORG_ID] [--region REGION] [--json]"
			echo ""
			echo "Options:"
			echo "  --runs N         Number of iterations (default: 100)"
			echo "  --concurrency N  Max parallel runs (default: 1, sequential)"
			echo "  --org ORG_ID     Organization ID (or set AGENTUITY_CLOUD_ORG_ID)"
			echo "  --region REGION  Region (or set AGENTUITY_REGION)"
			echo "  --json           Output final stats as JSON"
			exit 0
			;;
		*)
			echo "Unknown option: $1"
			exit 1
			;;
	esac
done

# Resolve org if not provided
if [ -z "$ORG_ID" ]; then
	ORG_RAW=$($CLI auth org current --json 2>&1) || true
	ORG_ID=$(echo "$ORG_RAW" | tr -d '"\n\r ' | grep -o 'org_[a-zA-Z0-9]*' || true)
	if [ -z "$ORG_ID" ]; then
		echo -e "${RED}Could not determine organization.${NC}"
		echo -e "${RED}Use --org ORG_ID or set AGENTUITY_CLOUD_ORG_ID${NC}"
		exit 1
	fi
fi

# Resolve region if not provided — check CLI config
if [ -z "$REGION" ]; then
	CONFIG_FILE="$HOME/.config/agentuity/config.json"
	if [ -f "$CONFIG_FILE" ]; then
		REGION=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('region',''))" 2>/dev/null || true)
	fi
	if [ -z "$REGION" ]; then
		echo -e "${RED}Could not determine region.${NC}"
		echo -e "${RED}Use --region REGION or set AGENTUITY_REGION${NC}"
		exit 1
	fi
fi

# Build sandbox run command with org and region
SANDBOX_CMD="$CLI cloud sandbox run --org-id $ORG_ID --region $REGION -- true"

# ────────────────────────────────────────────
# Portable millisecond timestamp (macOS + Linux)
# macOS date doesn't support %N, so use python3 or perl
# ────────────────────────────────────────────
now_ms() {
	if [[ "$OSTYPE" == darwin* ]]; then
		python3 -c 'import time; print(int(time.time()*1000))'
	else
		# Linux: date supports %s%N
		echo $(( $(date +%s%N) / 1000000 ))
	fi
}

# Temp files for collecting results
RESULTS_DIR=$(mktemp -d)
trap 'rm -rf "$RESULTS_DIR"' EXIT

# ────────────────────────────────────────────
# Run a single sandbox invocation
# Args: $1 = run index
# Writes: duration_ms to $RESULTS_DIR/$index.duration
#         "ok" or "fail" to $RESULTS_DIR/$index.status
# ────────────────────────────────────────────
run_one() {
	local idx="$1"
	local start_ms end_ms duration_ms

	start_ms=$(now_ms)

	if $SANDBOX_CMD >/dev/null 2>&1; then
		echo "ok" > "$RESULTS_DIR/$idx.status"
	else
		echo "fail" > "$RESULTS_DIR/$idx.status"
	fi

	end_ms=$(now_ms)

	duration_ms=$(( end_ms - start_ms ))
	echo "$duration_ms" > "$RESULTS_DIR/$idx.duration"
}

# ────────────────────────────────────────────
# Banner
# ────────────────────────────────────────────
if [ "$JSON_OUTPUT" = false ]; then
	echo ""
	echo -e "${BOLD}╔════════════════════════════════════════════════╗${NC}"
	echo -e "${BOLD}║  Sandbox Run Performance Test                  ║${NC}"
	echo -e "${BOLD}╚════════════════════════════════════════════════╝${NC}"
	echo ""
	echo -e "  Runs:        ${CYAN}$RUNS${NC}"
	echo -e "  Concurrency: ${CYAN}$CONCURRENCY${NC}"
	echo -e "  Org:         ${CYAN}$ORG_ID${NC}"
	echo -e "  Region:      ${CYAN}$REGION${NC}"
	echo -e "  Command:     ${CYAN}agentuity cloud sandbox run --org ... --region ... -- true${NC}"
	echo ""
fi

# ────────────────────────────────────────────
# Warmup: single run to prime auth / DNS / etc
# ────────────────────────────────────────────
if [ "$JSON_OUTPUT" = false ]; then
	echo -e "${YELLOW}Warmup run...${NC}"
fi
WARMUP_START=$(now_ms)
$SANDBOX_CMD && WARMUP_EXIT=0 || WARMUP_EXIT=$?
WARMUP_END=$(now_ms)
WARMUP_MS=$(( WARMUP_END - WARMUP_START ))

if [ $WARMUP_EXIT -ne 0 ]; then
	echo -e "${RED}Warmup failed (exit code $WARMUP_EXIT)${NC}"
	exit 1
fi

if [ "$JSON_OUTPUT" = false ]; then
	echo -e "${GREEN}Warmup complete (${WARMUP_MS}ms)${NC}"
	echo ""
fi

# ────────────────────────────────────────────
# Run the benchmark
# ────────────────────────────────────────────
TOTAL_START=$(now_ms)

if [ "$CONCURRENCY" -le 1 ]; then
	# Sequential mode
	for i in $(seq 1 "$RUNS"); do
		run_one "$i"
		status=$(cat "$RESULTS_DIR/$i.status")
		duration=$(cat "$RESULTS_DIR/$i.duration")
		if [ "$JSON_OUTPUT" = false ]; then
			if [ "$status" = "ok" ]; then
				printf "  [%3d/%d] ${GREEN}OK${NC}  %6dms\n" "$i" "$RUNS" "$duration"
			else
				printf "  [%3d/%d] ${RED}FAIL${NC} %6dms\n" "$i" "$RUNS" "$duration"
			fi
		fi
	done
else
	# Parallel mode with concurrency limit
	active=0
	for i in $(seq 1 "$RUNS"); do
		run_one "$i" &
		active=$((active + 1))
		if [ "$active" -ge "$CONCURRENCY" ]; then
			wait -n 2>/dev/null || wait
			active=$((active - 1))
		fi
	done
	wait

	# Print results after all complete
	if [ "$JSON_OUTPUT" = false ]; then
		for i in $(seq 1 "$RUNS"); do
			status=$(cat "$RESULTS_DIR/$i.status")
			duration=$(cat "$RESULTS_DIR/$i.duration")
			if [ "$status" = "ok" ]; then
				printf "  [%3d/%d] ${GREEN}OK${NC}  %6dms\n" "$i" "$RUNS" "$duration"
			else
				printf "  [%3d/%d] ${RED}FAIL${NC} %6dms\n" "$i" "$RUNS" "$duration"
			fi
		done
	fi
fi

TOTAL_END=$(now_ms)
TOTAL_MS=$(( TOTAL_END - TOTAL_START ))

# ────────────────────────────────────────────
# Collect results and compute stats
# ────────────────────────────────────────────
SUCCESS=0
FAIL=0
DURATIONS=()

for i in $(seq 1 "$RUNS"); do
	status=$(cat "$RESULTS_DIR/$i.status")
	duration=$(cat "$RESULTS_DIR/$i.duration")
	DURATIONS+=("$duration")
	if [ "$status" = "ok" ]; then
		SUCCESS=$((SUCCESS + 1))
	else
		FAIL=$((FAIL + 1))
	fi
done

# Sort durations numerically
IFS=$'\n' SORTED=($(sort -n <<<"${DURATIONS[*]}")); unset IFS

COUNT=${#SORTED[@]}
MIN=${SORTED[0]}
MAX=${SORTED[$((COUNT - 1))]}

# Sum
SUM=0
for d in "${SORTED[@]}"; do
	SUM=$((SUM + d))
done
MEAN=$((SUM / COUNT))

# Median
if (( COUNT % 2 == 1 )); then
	MEDIAN=${SORTED[$((COUNT / 2))]}
else
	MID=$((COUNT / 2))
	MEDIAN=$(( (SORTED[MID - 1] + SORTED[MID]) / 2 ))
fi

# Percentiles (P95, P99)
P95_IDX=$(( (COUNT * 95 + 99) / 100 - 1 ))
P99_IDX=$(( (COUNT * 99 + 99) / 100 - 1 ))
# Clamp
(( P95_IDX >= COUNT )) && P95_IDX=$((COUNT - 1))
(( P99_IDX >= COUNT )) && P99_IDX=$((COUNT - 1))
P95=${SORTED[$P95_IDX]}
P99=${SORTED[$P99_IDX]}

# Standard deviation (integer approx via bc)
if command -v bc &>/dev/null; then
	SUM_SQ=0
	for d in "${SORTED[@]}"; do
		DIFF=$((d - MEAN))
		SUM_SQ=$((SUM_SQ + DIFF * DIFF))
	done
	STDDEV=$(echo "scale=1; sqrt($SUM_SQ / $COUNT)" | bc 2>/dev/null || echo "N/A")
else
	STDDEV="N/A"
fi

# ────────────────────────────────────────────
# Output
# ────────────────────────────────────────────
if [ "$JSON_OUTPUT" = true ]; then
	# Build JSON durations array
	DURATIONS_JSON="["
	first=true
	for d in "${DURATIONS[@]}"; do
		if [ "$first" = true ]; then
			DURATIONS_JSON+="$d"
			first=false
		else
			DURATIONS_JSON+=",$d"
		fi
	done
	DURATIONS_JSON+="]"

	cat <<EOF
{
  "runs": $RUNS,
  "concurrency": $CONCURRENCY,
  "success": $SUCCESS,
  "failed": $FAIL,
  "warmupMs": $WARMUP_MS,
  "totalMs": $TOTAL_MS,
  "stats": {
    "minMs": $MIN,
    "maxMs": $MAX,
    "meanMs": $MEAN,
    "medianMs": $MEDIAN,
    "p95Ms": $P95,
    "p99Ms": $P99,
    "stddevMs": "$STDDEV"
  },
  "durations": $DURATIONS_JSON
}
EOF
else
	echo ""
	echo -e "${BOLD}════════════════════════════════════════════════${NC}"
	echo -e "${BOLD}  Results${NC}"
	echo -e "${BOLD}════════════════════════════════════════════════${NC}"
	echo ""
	echo -e "  Runs:          ${CYAN}$RUNS${NC}"
	echo -e "  Success:       ${GREEN}$SUCCESS${NC}"
	echo -e "  Failed:        ${RED}$FAIL${NC}"
	echo -e "  Warmup:        ${CYAN}${WARMUP_MS}ms${NC}"
	echo -e "  Total time:    ${CYAN}${TOTAL_MS}ms${NC}"
	echo ""
	echo -e "${BOLD}  Latency Statistics (ms)${NC}"
	echo -e "  ──────────────────────────"
	printf "  Min:           ${CYAN}%dms${NC}\n" "$MIN"
	printf "  Max:           ${CYAN}%dms${NC}\n" "$MAX"
	printf "  Mean:          ${CYAN}%dms${NC}\n" "$MEAN"
	printf "  Median:        ${CYAN}%dms${NC}\n" "$MEDIAN"
	printf "  P95:           ${CYAN}%dms${NC}\n" "$P95"
	printf "  P99:           ${CYAN}%dms${NC}\n" "$P99"
	echo -e "  Std Dev:       ${CYAN}${STDDEV}ms${NC}"
	echo ""

	# Success rate
	if [ "$FAIL" -eq 0 ]; then
		echo -e "  ${GREEN}100% success rate${NC}"
	else
		RATE=$(( SUCCESS * 100 / RUNS ))
		echo -e "  ${YELLOW}${RATE}% success rate ($FAIL failures)${NC}"
	fi
	echo ""
fi
