#!/usr/bin/env bash
#
# evaluation/slither.sh — static analysis of the three registries (spec V7).
#
# Best-effort by design: if slither (or solc) is not installed, this prints an
# install hint and exits 0 so it never hard-fails an evaluation pipeline. When
# slither IS available it analyzes each contract with the OpenZeppelin remapping
# and writes a per-contract report under evaluation/.
set -euo pipefail

cd "$(dirname "$0")/.."
OUT_DIR="evaluation"

if ! command -v slither >/dev/null 2>&1; then
  echo "[slither] not installed — skipping static analysis."
  echo "[slither] install with: pip3 install slither-analyzer  (also needs solc; e.g. 'pip3 install solc-select && solc-select install 0.8.28 && solc-select use 0.8.28')"
  exit 0
fi

CONTRACTS=(
  "contracts/IdentityRegistry.sol"
  "contracts/PrescriptionRegistry.sol"
  "contracts/KeyAccessRegistry.sol"
)

status=0
for c in "${CONTRACTS[@]}"; do
  base="$(basename "$c" .sol)"
  echo "[slither] analyzing $c ..."
  # Do not let a findings exit-code abort the loop; capture per contract.
  if ! slither "$c" \
      --solc-remaps "@openzeppelin/=node_modules/@openzeppelin/" \
      --filter-paths "node_modules" \
      --checklist \
      2>&1 | tee "$OUT_DIR/slither-${base}.txt"; then
    echo "[slither] $base reported findings (see $OUT_DIR/slither-${base}.txt)"
    status=1
  fi
done

echo "[slither] done. Reports in $OUT_DIR/ . (non-zero exit only signals findings, not a script error.)"
exit "$status"
