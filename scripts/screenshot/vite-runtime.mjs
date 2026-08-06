/**
 * capture-screenshots.mjs / capture-reference-deck.mjs が共有する
 * vite（screenshot モード）の起動・停止・起動待ちのユーティリティ。
 */
import { spawn } from 'node:child_process'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 撮影するロケール。code は Playwright の context locale（UI 言語 = navigator.language、
// fixture 選択 = Accept-Language の双方に効く）。dir は出力サブディレクトリ、lang は fixture ファイル名の言語コード。
export const LOCALES = [
  { code: 'en-US', dir: 'en', lang: 'en' },
  { code: 'ja-JP', dir: 'ja', lang: 'ja' },
]

export async function waitForServer(url, timeoutMs = 120000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      /* not up yet */
    }
    await sleep(500)
  }
  throw new Error(`vite サーバが ${timeoutMs}ms 以内に起動しませんでした`)
}

/**
 * `npm run dev -- --mode screenshot` を起動する。detached: true でプロセスグループを分離し、
 * stopScreenshotVite で vite の孫プロセスごと確実に停止できるようにする
 * （npm → vite の入れ子のため、npm だけ kill すると vite が孤児化してジョブが終了しない）。
 */
export function startScreenshotVite(rootDir, extraEnv = {}) {
  const vite = spawn('npm', ['run', 'dev', '--', '--mode', 'screenshot'], {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    env: { ...process.env, ...extraEnv },
  })
  vite.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`))
  return vite
}

/** プロセスグループごと停止する（孤児 vite を残さない）。失敗時は単体 kill にフォールバック */
export function stopScreenshotVite(vite) {
  if (!vite.pid) return
  try {
    process.kill(-vite.pid, 'SIGTERM')
  } catch {
    vite.kill('SIGTERM')
  }
}
