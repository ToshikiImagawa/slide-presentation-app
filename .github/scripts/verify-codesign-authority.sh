#!/usr/bin/env bash
set -euo pipefail

TARGET_PATH="$1"
EXPECTED_IDENTITY="$2"

AUTHORITY="$(codesign -dvv "$TARGET_PATH" 2>&1 | grep '^Authority=' | head -1)"
echo "$AUTHORITY"
if ! grep -qF "$EXPECTED_IDENTITY" <<< "$AUTHORITY"; then
  echo "::error::codesign の Authority が期待する signing identity と一致しません(ad-hoc 署名への縮退の可能性): $AUTHORITY"
  exit 1
fi
