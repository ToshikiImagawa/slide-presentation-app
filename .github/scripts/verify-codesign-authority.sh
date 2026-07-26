#!/usr/bin/env bash
set -euo pipefail

TARGET_PATH="$1"
# GitHub secrets へのコピー時に混入しやすい末尾の改行/CR/前後の空白を除去する。
# codesign --sign の identity 解決は多少緩やかだが、ここでの文字列一致は厳密なため
# 見えない差分があると誤って不一致判定になる
EXPECTED_IDENTITY="$(printf '%s' "$2" | tr -d '\r\n' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

AUTHORITY="$(codesign -dvv "$TARGET_PATH" 2>&1 | grep '^Authority=' | head -1)"
echo "$AUTHORITY"
echo "debug: authority_len=${#AUTHORITY} identity_len=${#EXPECTED_IDENTITY}"
if ! grep -qF "$EXPECTED_IDENTITY" <<< "$AUTHORITY"; then
  echo "::error::codesign の Authority が期待する signing identity と一致しません(ad-hoc 署名への縮退の可能性): $AUTHORITY"
  exit 1
fi
