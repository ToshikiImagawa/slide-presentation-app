import { mergeRecord, normalizeHex } from './applyTheme'
import type { ColorPalette, PresentationData } from './data/types'

/**
 * meta.themeColors（外部12キーの色パレット）のうち、実際に値が指定されているキー一覧。
 * これらのキーは4段カスケード（reset → brand → themeColors → theme）で常に brand（組織/ブランドテーマ）より
 * 後の層に位置するため、brand 側の値が将来変わってもこのデッキには永久に反映されない（#172）。
 */
export function listOverriddenThemeColorKeys(themeColorsPalette: ColorPalette): string[] {
  return Object.entries(themeColorsPalette)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key)
}

/** 2つの色表記が同一色を指すか（正規化した6桁hexで比較）。どちらか解釈不能なら異なる色として扱う（安全側） */
function isSameColor(a: string, b: string): boolean {
  const hexA = normalizeHex(a)
  const hexB = normalizeHex(b)
  return hexA !== null && hexA === hexB
}

export interface ThemeColorsDelegationPlan {
  /** brand と同一色のため、委譲後は削除できる（brand に委譲する）キー */
  redundantKeys: string[]
  /** brand と異なる色のため、デッキ固有の意図的な上書きとして残すキー */
  overrideKeys: string[]
}

/** meta.themeColors の各キーを brand（組織/ブランドテーマ）の色と比較し、委譲可否を判定する（純粋関数） */
export function planThemeColorsDelegation(themeColorsPalette: ColorPalette, brandColors: ColorPalette): ThemeColorsDelegationPlan {
  const redundantKeys: string[] = []
  const overrideKeys: string[] = []
  for (const key of listOverriddenThemeColorKeys(themeColorsPalette)) {
    const deckValue = themeColorsPalette[key]!
    const brandValue = brandColors[key]
    if (brandValue && isSameColor(deckValue, brandValue)) {
      redundantKeys.push(key)
    } else {
      overrideKeys.push(key)
    }
  }
  return { redundantKeys, overrideKeys }
}

/**
 * meta.themeColors 指定を meta.brandTheme 参照へ一括委譲する（#172）。
 * brand と同一色のキーは削除して brand へ委譲し、brand と異なるキーはデッキ固有の意図的な上書きとして
 * theme.colors（4段カスケードで最上位）へ移す。meta.themeColors は撤去する（以後 brand が直接反映される）。
 */
export function delegateThemeColors(data: PresentationData, themeColorsPalette: ColorPalette, brandColors: ColorPalette): PresentationData {
  const { overrideKeys } = planThemeColorsDelegation(themeColorsPalette, brandColors)
  const preserved: ColorPalette = {}
  for (const key of overrideKeys) preserved[key] = themeColorsPalette[key]

  const nextMeta = { ...data.meta }
  delete nextMeta.themeColors

  return {
    ...data,
    meta: nextMeta,
    theme: { ...(data.theme ?? {}), colors: mergeRecord(preserved, data.theme?.colors) },
  }
}
