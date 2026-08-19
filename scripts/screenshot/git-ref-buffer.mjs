/**
 * git ref から任意ファイルをバッファとして読む共通ヘルパー。
 * diff-reference-deck.mjs（#246）と diff-screenshots.mjs（#125）がどちらも
 * 「`git show <ref>:<path>` を試し、対象が無ければ null」を必要とするため切り出す
 * （トリビアルな git show ラッパーの重複はコピペで残す価値が無い）。
 */
import { execFileSync } from 'node:child_process'

/** git コマンドを実行し、失敗（対象が存在しない等）した場合は null を返す */
export function tryGit(args) {
  try {
    return execFileSync('git', args, { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1024 * 1024 * 64 })
  } catch {
    return null
  }
}

/** git ref 側のファイルをバッファとして読む。存在しない（新規追加ファイル）場合は null */
export function readRefBuffer(base, relPath) {
  return tryGit(['show', `${base}:${relPath}`])
}
