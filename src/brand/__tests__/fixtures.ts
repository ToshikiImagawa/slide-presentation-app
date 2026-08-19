import type { BrandProfile, MappedColorKey } from '../types'

/** `compile.test.ts` と `layoutAssignmentHints.test.ts` が共有する `BrandProfile` の最小フィクスチャ。
 * 各テストは `overrides` で必要なフィールド（`masters` 等）だけ差し替える */
export function profile(overrides: Partial<BrandProfile> = {}): BrandProfile {
  const mappedColors: Record<MappedColorKey, string | null> = {
    bg1: '#ffffff',
    tx1: '#000000',
    bg2: '#f2f2f2',
    tx2: '#44546a',
    accent1: '#1f4e79',
    accent2: '#ed7d31',
    accent3: '#a5a5a5',
    accent4: '#ffc000',
    accent5: '#5b9bd5',
    accent6: '#70ad47',
    hlink: '#0563c1',
    folHlink: '#954f72',
  }
  return {
    name: 'Corporate',
    themePart: 'ppt/theme/theme1.xml',
    slideMasterPart: 'ppt/slideMasters/slideMaster1.xml',
    templateHash: 'a'.repeat(64),
    slideSize: { widthEmu: 12_192_000, heightEmu: 6_858_000 },
    thumbnail: null,
    logoCandidates: [],
    bandCandidates: [],
    textCandidates: [],
    markCandidates: [],
    embeddedFonts: [],
    mappedColors,
    fonts: { major: { latin: 'Trebuchet MS', ea: null, cs: null, jpan: null }, minor: { latin: 'Calibri', ea: null, cs: null, jpan: null } },
    masters: [],
    ...overrides,
  }
}
