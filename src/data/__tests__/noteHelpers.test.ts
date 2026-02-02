import { describe, it, expect } from 'vitest'
import { normalizeNotes, getSpeakerNotes, getSlideSummary, getVoicePath } from '../noteHelpers'
import type { SlideData } from '../types'

describe('normalizeNotes', () => {
  it('undefined を空の SlideNotes に変換する', () => {
    const result = normalizeNotes(undefined)
    expect(result).toEqual({ speakerNotes: undefined, summary: [] })
  })

  it('string を speakerNotes に変換する', () => {
    const result = normalizeNotes('テストノート')
    expect(result).toEqual({ speakerNotes: 'テストノート', summary: [] })
  })

  it('SlideNotes オブジェクトをそのまま返す（summary あり）', () => {
    const notes = { speakerNotes: 'ノート', summary: ['要点1', '要点2'] }
    const result = normalizeNotes(notes)
    expect(result).toEqual({ speakerNotes: 'ノート', summary: ['要点1', '要点2'], voice: undefined })
  })

  it('SlideNotes オブジェクトで summary がない場合は空配列にする', () => {
    const notes = { speakerNotes: 'ノートのみ' }
    const result = normalizeNotes(notes)
    expect(result).toEqual({ speakerNotes: 'ノートのみ', summary: [], voice: undefined })
  })

  it('空の SlideNotes オブジェクトを処理する', () => {
    const result = normalizeNotes({})
    expect(result).toEqual({ speakerNotes: undefined, summary: [], voice: undefined })
  })

  it('voice フィールドを保持する', () => {
    const notes = { speakerNotes: 'ノート', voice: '/audio/test.mp3' }
    const result = normalizeNotes(notes)
    expect(result).toEqual({ speakerNotes: 'ノート', summary: [], voice: '/audio/test.mp3' })
  })

  it('voice がない SlideNotes では voice が undefined になる', () => {
    const notes = { speakerNotes: 'ノート', summary: ['要点'] }
    const result = normalizeNotes(notes)
    expect(result.voice).toBeUndefined()
  })
})

describe('getSpeakerNotes', () => {
  const makeSlide = (notes?: string | { speakerNotes?: string; summary?: string[] }): SlideData => ({
    id: 'test',
    layout: 'center',
    content: { title: 'Test' },
    meta: notes !== undefined ? { notes } : undefined,
  })

  it('meta がないスライドでは undefined を返す', () => {
    const slide: SlideData = { id: 'test', layout: 'center', content: { title: 'Test' } }
    expect(getSpeakerNotes(slide)).toBeUndefined()
  })

  it('notes がないスライドでは undefined を返す', () => {
    expect(getSpeakerNotes(makeSlide())).toBeUndefined()
  })

  it('string の notes からスピーカーノートを取得する', () => {
    expect(getSpeakerNotes(makeSlide('テストノート'))).toBe('テストノート')
  })

  it('SlideNotes オブジェクトから speakerNotes を取得する', () => {
    expect(getSpeakerNotes(makeSlide({ speakerNotes: 'ノート' }))).toBe('ノート')
  })
})

describe('getSlideSummary', () => {
  const makeSlide = (notes?: string | { speakerNotes?: string; summary?: string[] }): SlideData => ({
    id: 'test',
    layout: 'center',
    content: { title: 'Test' },
    meta: notes !== undefined ? { notes } : undefined,
  })

  it('meta がないスライドでは空配列を返す', () => {
    const slide: SlideData = { id: 'test', layout: 'center', content: { title: 'Test' } }
    expect(getSlideSummary(slide)).toEqual([])
  })

  it('string の notes では空配列を返す', () => {
    expect(getSlideSummary(makeSlide('テスト'))).toEqual([])
  })

  it('SlideNotes オブジェクトから summary を取得する', () => {
    expect(getSlideSummary(makeSlide({ summary: ['要点1', '要点2'] }))).toEqual(['要点1', '要点2'])
  })

  it('summary がない SlideNotes では空配列を返す', () => {
    expect(getSlideSummary(makeSlide({ speakerNotes: 'ノート' }))).toEqual([])
  })
})

describe('getVoicePath', () => {
  const makeSlide = (notes?: string | { speakerNotes?: string; summary?: string[]; voice?: string }): SlideData => ({
    id: 'test',
    layout: 'center',
    content: { title: 'Test' },
    meta: notes !== undefined ? { notes } : undefined,
  })

  it('meta がないスライドでは undefined を返す', () => {
    const slide: SlideData = { id: 'test', layout: 'center', content: { title: 'Test' } }
    expect(getVoicePath(slide)).toBeUndefined()
  })

  it('notes がないスライドでは undefined を返す', () => {
    expect(getVoicePath(makeSlide())).toBeUndefined()
  })

  it('string の notes では undefined を返す', () => {
    expect(getVoicePath(makeSlide('テストノート'))).toBeUndefined()
  })

  it('voice が未定義の SlideNotes では undefined を返す', () => {
    expect(getVoicePath(makeSlide({ speakerNotes: 'ノート' }))).toBeUndefined()
  })

  it('voice が定義された SlideNotes からパスを取得する', () => {
    expect(getVoicePath(makeSlide({ voice: '/audio/intro.mp3' }))).toBe('/audio/intro.mp3')
  })

  it('voice と他のフィールドが共存する場合も正しく取得する', () => {
    expect(getVoicePath(makeSlide({ speakerNotes: 'ノート', summary: ['要点'], voice: '/audio/test.mp3' }))).toBe('/audio/test.mp3')
  })
})
