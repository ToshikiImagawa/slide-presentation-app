#!/usr/bin/env bash
set -euo pipefail

TARGET_PATH="$1"
# GitHub secrets へのコピー時に混入しやすい末尾の改行/CR/前後の空白・引用符
# (スマート引用符への自動変換を含む)を除去する。codesign --sign の identity 解決は
# 多少緩やかだが、ここでの文字列一致は厳密なため見えない差分があると誤って
# 不一致判定になる
EXPECTED_IDENTITY="$(printf '%s' "$2" | tr -d '\r\n' | sed -E "s/^[[:space:]\"'“”‘’]+//; s/[[:space:]\"'“”‘’]+\$//")"

AUTHORITY="$(codesign -dvv "$TARGET_PATH" 2>&1 | grep '^Authority=' | head -1)"
echo "$AUTHORITY"
if ! grep -qF "$EXPECTED_IDENTITY" <<< "$AUTHORITY"; then
  echo "::error::codesign の Authority が期待する signing identity と一致しません(ad-hoc 署名への縮退の可能性): $AUTHORITY"
  exit 1
fi
