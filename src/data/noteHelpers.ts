import type { SlideData, SlideNotes } from './types'

/** notes フィールドを正規化された SlideNotes オブジェクトに変換する */
export function normalizeNotes(notes: string | SlideNotes | undefined): SlideNotes {
  if (notes === undefined) {
    return { speakerNotes: undefined, summary: [] }
  }
  if (typeof notes === 'string') {
    return { speakerNotes: notes, summary: [] }
  }
  return { speakerNotes: notes.speakerNotes, summary: notes.summary ?? [], voice: notes.voice }
}

/** スライドからスピーカーノートを取得する */
export function getSpeakerNotes(slide: SlideData): string | undefined {
  return normalizeNotes(slide.meta?.notes).speakerNotes
}

/** スライドから要点サマリーを取得する */
export function getSlideSummary(slide: SlideData): string[] {
  return normalizeNotes(slide.meta?.notes).summary ?? []
}

/** スライドから音声ファイルパスを取得する */
export function getVoicePath(slide: SlideData): string | undefined {
  return normalizeNotes(slide.meta?.notes).voice
}
