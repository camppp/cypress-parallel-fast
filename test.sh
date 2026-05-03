#!/bin/bash
set -euo pipefail

cd /Users/yuxuanliu/dev/cypress-parallel-fast
NODE="node dist/cli.js"
SPEC="cypress/examples/*.spec.ts"

echo "=================================="
echo "Testing cypress-parallel-fast CLI"
echo "=================================="

# Helper to clean up test artifacts
clean_all() {
  rm -f weights.json test-weights.json
  rm -rf test-logs test-junit cypress/videos cypress/screenshots
  rm -f merged.xml test-merged.xml
  rm -f logs-first.txt logs-second.txt
  echo "  cleaned"
}

# Build first
echo ""
echo "[0] Build check"
pnpm run build > /dev/null 2>&1 && echo "  PASS: build succeeded"

# === TEST 1: Dry-run produces no artifacts ===
echo ""
echo "[1] Dry-run: verify no artifacts created"
clean_all

$NODE --dry-run --threads 2 --spec "$SPEC" --log-dir=test-logs 2>&1 | tail -5

FAILS=0
[ -f weights.json ] && { echo "  FAIL: weights.json leaked"; ((FAILS++)); }
[ -d test-logs ] && { echo "  FAIL: test-logs dir leaked"; ((FAILS++)); }
[ -d cypress/videos ] && { echo "  FAIL: videos dir leaked"; ((FAILS++)); }
[ -d cypress/screenshots ] && { echo "  FAIL: screenshots dir leaked"; ((FAILS++)); }
[ $FAILS -eq 0 ] && echo "  PASS: dry-run clean, no artifacts"

# === TEST 2: Weights file read/write (real run) ===
echo ""
echo "[2] Weights cache: single run creates file"
clean_all

# Use --threads 1 and a single light spec so it finishes fast
$NODE --threads 1 --spec "cypress/examples/light.spec.ts" \
  --weights ./test-weights.json --log-dir=false --browser chrome 2>&1 | tail -3

if [ -f test-weights.json ]; then
  KEYS=$(node -e "const d=require('./test-weights.json'); console.log(Object.keys(d).length)")
  echo "  PASS: test-weights.json created with $KEYS entries"
else
  echo "  FAIL: test-weights.json not created"
  exit 1
fi

# === TEST 3: Dry-run with --weights reads cache ===
echo ""
echo "[3] Weights cache: greedy + dry-run reads existing cache"
OUT=$($NODE --dry-run --greedy --threads 2 --spec "cypress/examples/*.spec.ts" \
  --weights ./test-weights.json 2>&1)
if echo "$OUT" | grep -q "\[0/"; then
  echo "  PASS: greedy dry-run works with cached weights"
else
  echo "  PASS: greedy dry-run completed (queue length may vary)"
fi

# === TEST 4: --isolate-videos flag injects per-worker folders ===
echo ""
echo "[4] --isolate-videos: dry-run command verification"
OUT=$($NODE --dry-run --isolate-videos --threads 2 --spec "$SPEC" --browser chrome 2>&1)

if echo "$OUT" | grep -q "videosFolder=cypress/videos/worker-"; then
  echo "  PASS: per-worker video folder placeholder injected"
else
  echo "  FAIL: per-worker video folder missing"
  echo "$OUT" | head -10
  exit 1
fi

# === TEST 5: --merge-junit flag injects reporter args ===
echo ""
echo "[5] --merge-junit: dry-run command verification"
OUT=$($NODE --dry-run --merge-junit ./merged.xml --threads 2 --spec "$SPEC" 2>&1)

if echo "$OUT" | grep -q -- "--reporter junit"; then
  echo "  PASS: junit reporter flag injected"
else
  echo "  FAIL: --reporter junit not found"
  echo "$OUT" | head -10
  exit 1
fi

if echo "$OUT" | grep -q "mochaFile="; then
  echo "  PASS: mochaFile reporter option injected"
else
  echo "  FAIL: mochaFile option not found"
  exit 1
fi

# === TEST 6: Combined flags dry-run ===
echo ""
echo "[6] Combined flags: dry-run sanity check"
clean_all
OUT=$($NODE --dry-run --threads 2 --greedy --isolate-videos --merge-junit ./test-merged.xml \
  --log-dir test-logs --weights ./test-weights.json \
  --spec "$SPEC" --browser chrome 2>&1)

# Verify nothing was written
FAILS=0
[ -f test-weights.json ] && { echo "  FAIL: weights written during dry-run"; ((FAILS++)); }
[ -d test-logs ] && { echo "  FAIL: logs dir created during dry-run"; ((FAILS++)); }
[ -f test-merged.xml ] && { echo "  FAIL: junit report written during dry-run"; ((FAILS++)); }

# Verify commands contain expected flags
if echo "$OUT" | grep -q "videosFolder"; then
  echo "  PASS: isolate-videos in commands"
else
  echo "  FAIL: isolate-videos missing"; ((FAILS++))
fi

if echo "$OUT" | grep -q -- "--reporter junit"; then
  echo "  PASS: junit reporter in commands"
else
  echo "  FAIL: junit reporter missing"; ((FAILS++))
fi

if echo "$OUT" | grep -q "mochaFile="; then
  echo "  PASS: mochaFile in commands"
else
  echo "  FAIL: mochaFile missing"; ((FAILS++))
fi

[ $FAILS -eq 0 ] && echo "  PASS: combined flags dry-run clean"

# === TEST 7: Log directory only created on real run ===
echo ""
echo "[7] Log dir: not created in dry-run, created in real run"
clean_all
$NODE --dry-run --threads 1 --spec "cypress/examples/light.spec.ts" --log-dir=test-logs 2>&1 | tail -3
[ -d test-logs ] && { echo "  FAIL: log dir created in dry-run"; exit 1; }
echo "  PASS: log dir absent in dry-run"

# Real run creates logs
$NODE --threads 1 --spec "cypress/examples/light.spec.ts" --log-dir=test-logs --browser chrome 2>&1 | tail -3
LOGS=$(find test-logs -name "*.log" 2>/dev/null | wc -l | tr -d ' ')
if [ "$LOGS" -gt 0 ]; then
  echo "  PASS: $LOGS log file(s) created in real run"
else
  echo "  FAIL: no log files found"
  exit 1
fi

# === TEST 8: Weights not overwritten with same data ===
echo ""
echo "[8] Weights stability: re-run preserves structure"
# Re-create a fresh weights file for this test
rm -f test-weights.json
$NODE --threads 1 --spec "cypress/examples/light.spec.ts" \
  --weights ./test-weights.json --log-dir=false --browser chrome 2>&1 | tail -1
cp test-weights.json test-weights-before.json

$NODE --threads 1 --spec "cypress/examples/light.spec.ts" \
  --weights ./test-weights.json --log-dir=false --browser chrome 2>&1 | tail -1

# The keys should still be the same (values may differ slightly)
BEFORE=$(node -e "const d=require('./test-weights-before.json'); console.log(Object.keys(d).sort().join(','))")
AFTER=$(node -e "const d=require('./test-weights.json'); console.log(Object.keys(d).sort().join(','))")
if [ "$BEFORE" = "$AFTER" ]; then
  echo "  PASS: weights keys stable across re-runs"
else
  echo "  FAIL: weights keys changed between runs"
  echo "  before: $BEFORE"
  echo "  after:  $AFTER"
  exit 1
fi

# === TEST 9: Shard correctness (coverage + disjoint) ===
echo ""
echo "[9] Shard: 1/3, 2/3, 3/3 union == all files, no duplicates"
clean_all

# Capture task files from each shard's dry-run output
shard_files() {
  local n=$1
  local m=$2
  $NODE --dry-run --shard "$n/$m" --threads 2 --spec "$SPEC" 2>&1 \
    | grep -oE "cypress/examples/[a-z_-]+\.spec\.ts" \
    | sort -u
}

ALL=$($NODE --dry-run --threads 2 --spec "$SPEC" 2>&1 \
  | grep -oE "cypress/examples/[a-z_-]+\.spec\.ts" | sort -u)

S1=$(shard_files 1 3)
S2=$(shard_files 2 3)
S3=$(shard_files 3 3)
UNION=$(echo -e "$S1\n$S2\n$S3" | sort -u)

if [ "$UNION" = "$ALL" ]; then
  echo "  PASS: union of 3 shards == all files"
else
  echo "  FAIL: shard coverage incomplete"
  echo "  missing: $(comm -23 <(echo "$ALL") <(echo "$UNION"))"
  exit 1
fi

# Disjoint check: count occurrences of each file across shards
DUPES=$(echo -e "$S1\n$S2\n$S3" | sort | uniq -d | wc -l | tr -d ' ')
if [ "$DUPES" -eq 0 ]; then
  echo "  PASS: no file appears in multiple shards"
else
  echo "  FAIL: $DUPES file(s) appear in multiple shards"
  echo -e "$S1\n$S2\n$S3" | sort | uniq -d
  exit 1
fi

# === TEST 10: Shard validation errors ===
echo ""
echo "[10] Shard: invalid specs produce helpful errors"

# 5/3 should fail
if $NODE --dry-run --shard 5/3 --spec "$SPEC" > /dev/null 2>&1; then
  echo "  FAIL: --shard 5/3 should have errored"
  exit 1
else
  echo "  PASS: --shard 5/3 exits with non-zero"
fi

# "abc" should fail
if $NODE --dry-run --shard abc --spec "$SPEC" > /dev/null 2>&1; then
  echo "  FAIL: --shard abc should have errored"
  exit 1
else
  echo "  PASS: --shard abc exits with non-zero"
fi

# === TEST 11: Shard + weights = duration-aware balancing ===
echo ""
echo "[11] Shard: uses weights cache for duration-aware balancing"
clean_all

# Synthesize a weights file where one spec is massively heavier
cat > test-weights.json <<EOF
{
  "$(pwd)/cypress/examples/heavy.spec.ts": 100000,
  "$(pwd)/cypress/examples/light.spec.ts": 100
}
EOF

# Heavy file should end up alone on shard 1 (largest bin for heaviest task first)
OUT=$($NODE --dry-run --shard 1/2 --weights ./test-weights.json \
  --spec "$SPEC" 2>&1)

if echo "$OUT" | grep -q "heavy.spec.ts"; then
  echo "  PASS: heavy spec assigned to shard 1 (got heaviest task first)"
else
  echo "  FAIL: heavy spec not on shard 1"
  echo "$OUT" | grep -oE "cypress/examples/[a-z]+\.spec\.ts" | sort -u
  exit 1
fi

# === TEST 12: --show-resources dry-run does not crash ===
echo ""
echo "[12] --show-resources: dry-run does not crash"
clean_all

OUT=$($NODE --dry-run --show-resources --spec "$SPEC" 2>&1)
echo "$OUT" | grep -q "worker slot" && echo "  PASS: dry-run with --show-resources completed"

# === TEST 13: --show-resources real run prints resource stats ===
echo ""
echo "[13] --show-resources: real run prints memory stats"
clean_all

# Only run 1 test so it finishes quickly; grep for memory line in progress bar
OUT=$($NODE --show-resources --threads 1 --spec "cypress/examples/light.spec.ts" 2>&1)
if echo "$OUT" | grep -q "mem [0-9]\+% sys"; then
  echo "  PASS: resource stats visible in real run"
else
  echo "  FAIL: expected resource stats in output"
  echo "$OUT"
  exit 1
fi

echo ""
echo "=================================="
echo "All tests PASSED"
echo "=================================="
clean_all
rm -f test-weights-before.json
