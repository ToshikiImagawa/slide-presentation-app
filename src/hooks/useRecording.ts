import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'
import { useTranslation } from '../i18n'
import { useToast } from '../toast'

/** 録画の状態 */
export type RecordingState = 'idle' | 'recording' | 'saving' | 'error'

export interface UseRecordingOptions {
  /** 録画対象の音声トラックに合成する HTMLAudioElement（useAudioPlayer.audioElementRef） */
  audioElementRef: React.RefObject<HTMLAudioElement | null>
}

export interface UseRecordingReturn {
  state: RecordingState
  /** getDisplayMedia({ video: true, audio: false }) を呼び出し、選択完了後に録画を開始する。キャンセル時は state を 'idle' に保つ */
  start: () => void
  /** 録画を停止し、保存先選択を経てファイルに書き出す。保存先選択がキャンセルされた場合は記録済みデータを破棄し state を 'idle' に戻す */
  stop: () => void
}

/** ondataavailable のチャンク間隔。大きなメモリ確保を避けるため都度 Blob[] へ退避する（design.md 7章 NFR-PR-003） */
const TIMESLICE_MS = 1000

/**
 * 優先度順の候補。MP4 を最優先にする: macOS の QuickTime / Windows のメディアプレイヤー等、
 * OS標準の動画プレイヤーはWebMを再生できないことが多く、WebViewがWebM録画に対応していても
 * 再生できるファイルにはならない。mimeType未指定時のWKWebViewの既定出力もMP4である（#381実機確認）。
 * MP4非対応のWebView（将来的な他エンジン等）向けにWebMをフォールバックとして残す（design.md 9.1）
 */
const MIME_TYPE_CANDIDATES = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']

function pickSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return ''
  return MIME_TYPE_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

function extensionForMimeType(mimeType: string): 'webm' | 'mp4' {
  return mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'
}

export function isRecordingSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function' && typeof window !== 'undefined' && typeof window.MediaRecorder === 'function'
}

export function useRecording({ audioElementRef }: UseRecordingOptions): UseRecordingReturn {
  const supported = isRecordingSupported()
  const [state, setState] = useState<RecordingState>(supported ? 'idle' : 'error')
  const stateRef = useRef(state)
  stateRef.current = state
  const { showToast } = useToast()
  const { t } = useTranslation()

  // createMediaElementSource() は同一 HTMLAudioElement に対して一度しか呼び出せないため、
  // AudioContext/MediaStreamAudioDestinationNode はシングルトンとして遅延生成し再利用する（design.md 9.1）
  const audioContextRef = useRef<AudioContext | null>(null)
  const destinationNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeTypeRef = useRef('')

  const getAudioDestination = useCallback((): MediaStreamAudioDestinationNode | null => {
    const audioEl = audioElementRef.current
    if (!audioEl) return null
    if (!audioContextRef.current) {
      const audioContext = new AudioContext()
      const source = audioContext.createMediaElementSource(audioEl)
      const destination = audioContext.createMediaStreamDestination()
      // 録画用ストリームとスピーカー出力の両方に接続する。ここを怠ると録画開始によって通常のvoice再生が無音化する
      source.connect(destination)
      source.connect(audioContext.destination)
      audioContextRef.current = audioContext
      destinationNodeRef.current = destination
    }
    return destinationNodeRef.current
  }, [audioElementRef])

  const releaseScreenStream = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((track) => track.stop())
    screenStreamRef.current = null
  }, [])

  const saveRecording = useCallback(async () => {
    const mimeType = mimeTypeRef.current || 'video/webm'
    const extension = extensionForMimeType(mimeType)
    const blob = new Blob(chunksRef.current, { type: mimeType })
    chunksRef.current = []
    try {
      const buffer = new Uint8Array(await blob.arrayBuffer())
      const destination = await save({
        defaultPath: `recording.${extension}`,
        filters: [{ name: extension === 'mp4' ? 'MP4 Video' : 'WebM Video', extensions: [extension] }],
      })
      if (!destination) {
        // 保存先選択キャンセル: 記録済みデータを破棄して idle に戻す（design.md 9.1）
        setState('idle')
        return
      }
      await writeFile(destination, buffer)
      setState('idle')
    } catch (e) {
      console.error(e)
      setState('error')
      showToast(t('recording.saveError'))
    }
  }, [showToast, t])

  const handleRecorderStop = useCallback(() => {
    releaseScreenStream()
    recorderRef.current = null
    void saveRecording()
  }, [releaseScreenStream, saveRecording])

  const stopRecorder = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    setState('saving')
    recorder.stop()
  }, [])

  const startInternal = useCallback(async () => {
    if (!supported || stateRef.current !== 'idle') return
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      screenStreamRef.current = screenStream

      const combinedStream = new MediaStream()
      screenStream.getVideoTracks().forEach((track) => combinedStream.addTrack(track))
      const audioDestination = getAudioDestination()
      audioDestination?.stream.getAudioTracks().forEach((track) => combinedStream.addTrack(track))

      const mimeType = pickSupportedMimeType()
      mimeTypeRef.current = mimeType
      const recorder = mimeType ? new MediaRecorder(combinedStream, { mimeType }) : new MediaRecorder(combinedStream)
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = handleRecorderStop
      recorder.onerror = () => {
        // 記録済みチャンクがあれば保存フローへ、なければ何も残さず idle に戻す（FR-PR-009, DC-PR-001）
        if (chunksRef.current.length > 0) {
          stopRecorder()
        } else {
          releaseScreenStream()
          recorderRef.current = null
          setState('idle')
        }
      }
      // OS側の「共有を停止」操作も録画停止のトリガーとして監視する（FR-PR-009, design.md 9.1）
      screenStream.getVideoTracks()[0]?.addEventListener('ended', stopRecorder, { once: true })

      recorderRef.current = recorder
      recorder.start(TIMESLICE_MS)
      setState('recording')
    } catch {
      // 共有選択のキャンセル・macOS画面録画権限の未許可のいずれもここに到達する（NFR-PR-001, FR-PR-008）
      setState('idle')
      showToast(t('recording.permissionError'))
    }
  }, [supported, getAudioDestination, handleRecorderStop, releaseScreenStream, showToast, stopRecorder, t])

  const start = useCallback(() => {
    void startInternal()
  }, [startInternal])

  const stop = useCallback(() => {
    stopRecorder()
  }, [stopRecorder])

  // アンマウント時に録画用リソースを確実に解放する（T-003, DC-PR-002）。
  // ハンドラを外してから stop() することで、アンマウント後に保存フロー（ダイアログ表示）が走らないようにする
  useEffect(() => {
    return () => {
      const recorder = recorderRef.current
      if (recorder) {
        recorder.ondataavailable = null
        recorder.onstop = null
        recorder.onerror = null
        if (recorder.state !== 'inactive') recorder.stop()
      }
      recorderRef.current = null
      releaseScreenStream()
      audioContextRef.current?.close()
      audioContextRef.current = null
      destinationNodeRef.current = null
    }
  }, [releaseScreenStream])

  return useMemo(() => ({ state, start, stop }), [state, start, stop])
}
