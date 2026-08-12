import type { PresentationData, SlideData, ValidationError } from './types'

/**
 * スライドデータが不正なときに表示する最小フォールバック（A-005: エラー状態でもプレゼンテーションが表示可能であること）。
 * テンプレートガイドのサンプルは .spkg として配布するため、アプリに同梱するのはこの1枚だけに留める
 */
export function getFallbackPresentationData(locale: string): PresentationData {
  const isJa = locale.startsWith('ja')
  const title = isJa ? 'スライドを表示できません' : 'Cannot display slides'
  return {
    meta: { title },
    slides: [
      {
        id: 'fallback-invalid-data',
        layout: 'center',
        content: {
          title,
          subtitle: isJa ? 'スライドデータの形式を確認してください（<code>meta.title</code> と <code>slides</code> 配列が必要です）' : 'Check the slide data format (<code>meta.title</code> and a <code>slides</code> array are required)',
        },
      },
    ],
  }
}

/** サンプルスライドをオンラインから取得できなかったときに表示する最小フォールバック */
export function getSampleUnavailablePresentationData(locale: string): PresentationData {
  const isJa = locale.startsWith('ja')
  const title = isJa ? 'サンプルを取得できませんでした' : 'Could not load the sample'
  return {
    meta: { title },
    slides: [
      {
        id: 'sample-unavailable',
        layout: 'center',
        content: {
          title,
          subtitle: isJa ? 'サンプルスライドはオンラインで配布されています。\nネットワーク接続を確認して、もう一度お試しください。' : 'The sample deck is distributed online.\nCheck your network connection and try again.',
        },
      },
    ],
  }
}

/** AI新規作成（ホーム画面）の土台となる最小構成のプレゼンテーションデータを返す */
export function getBlankPresentationData(locale: string): PresentationData {
  const title = locale.startsWith('ja') ? '新しいプレゼンテーション' : 'New Presentation'
  return {
    meta: { title },
    slides: [{ id: 'slide-1', layout: 'center', content: { title } }],
  }
}

function addError(errors: ValidationError[], path: string, message: string, expected: string, actual: string): void {
  errors.push({ path, message, expected, actual })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** JSON 由来の値は配列でない可能性があるため、判定・描画前に配列だけを通す（不正なデッキで判定・描画自体を落とさない）。
 * chart/validateChart.ts と diagram/Diagram.tsx が共有する（#240） */
export function asArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : []
}

function validateSlideNotes(notes: unknown, prefix: string, errors: ValidationError[]): void {
  if (notes === undefined || notes === null) return
  if (typeof notes === 'string') return
  if (!isRecord(notes)) {
    addError(errors, `${prefix}.meta.notes`, 'notesはstring, SlideNotesオブジェクト, またはundefinedである必要があります', 'string | SlideNotes | undefined', typeof notes)
    return
  }
  if (notes.speakerNotes !== undefined && typeof notes.speakerNotes !== 'string') {
    addError(errors, `${prefix}.meta.notes.speakerNotes`, 'speakerNotesはstringである必要があります', 'string', typeof notes.speakerNotes)
  }
  if (notes.summary !== undefined && !Array.isArray(notes.summary)) {
    addError(errors, `${prefix}.meta.notes.summary`, 'summaryはstring[]である必要があります', 'string[]', typeof notes.summary)
  }
  if (notes.voice !== undefined && typeof notes.voice !== 'string') {
    addError(errors, `${prefix}.meta.notes.voice`, 'voiceはstringである必要があります', 'string', typeof notes.voice)
  }
}

function validateSlide(slide: unknown, index: number, errors: ValidationError[]): void {
  const prefix = `slides[${index}]`
  if (!isRecord(slide)) {
    addError(errors, prefix, 'スライドはオブジェクトである必要があります', 'object', typeof slide)
    return
  }
  if (typeof slide.id !== 'string' || slide.id === '') {
    addError(errors, `${prefix}.id`, 'idは空でない文字列である必要があります', 'string', String(typeof slide.id))
  }
  if (typeof slide.layout !== 'string' || slide.layout === '') {
    addError(errors, `${prefix}.layout`, 'layoutは空でない文字列である必要があります', 'string', String(typeof slide.layout))
  }
  if (!isRecord(slide.content)) {
    addError(errors, `${prefix}.content`, 'contentはオブジェクトである必要があります', 'object', typeof slide.content)
  }
  if (isRecord(slide.meta)) {
    validateSlideNotes(slide.meta.notes, prefix, errors)
  }
}

/** バリデーションエラーの詳細を取得する */
export function getValidationErrors(data: unknown): ValidationError[] {
  const errors: ValidationError[] = []

  if (!isRecord(data)) {
    addError(errors, '', 'データはオブジェクトである必要があります', 'object', typeof data)
    return errors
  }

  // meta チェック
  if (!isRecord(data.meta)) {
    addError(errors, 'meta', 'metaはオブジェクトである必要があります', 'object', typeof data.meta)
  } else if (typeof data.meta.title !== 'string' || data.meta.title === '') {
    addError(errors, 'meta.title', 'meta.titleは空でない文字列である必要があります', 'string', typeof data.meta.title)
  }

  // slides チェック
  if (!Array.isArray(data.slides)) {
    addError(errors, 'slides', 'slidesは配列である必要があります', 'array', typeof data.slides)
  } else {
    if (data.slides.length === 0) {
      addError(errors, 'slides', 'slidesは1つ以上のスライドを含む必要があります', 'non-empty array', 'empty array')
    }
    for (let i = 0; i < data.slides.length; i++) {
      validateSlide(data.slides[i], i, errors)
    }
  }

  return errors
}

/** スライドデータのバリデーション。型ガードとして動作する */
export function validatePresentationData(data: unknown): data is PresentationData {
  return getValidationErrors(data).length === 0
}

/** スライドデータを読み込む。未指定・バリデーション失敗時はデフォルトデータにフォールバック */
export function loadPresentationData(source: PresentationData | undefined, defaultData: PresentationData): PresentationData {
  if (source === undefined) {
    return defaultData
  }

  const errors = getValidationErrors(source)
  if (errors.length > 0) {
    console.error('[slide-content-customization] バリデーションエラーが検出されました:')
    for (const error of errors) {
      console.error(`  ${error.path}: ${error.message} (期待: ${error.expected}, 実際: ${error.actual})`)
    }
    console.warn('[slide-content-customization] デフォルトデータにフォールバックします')
    return defaultData
  }

  return source as PresentationData & { slides: SlideData[] }
}
