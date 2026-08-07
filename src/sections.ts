import type { SectionInfo, SlideData } from './data'

/**
 * slides[].meta.section の連続ブロックから章を導出する（#191）。同じタイトルが隣接して続く限り1つの章として
 * 数え、タイトルが変わる・未指定のスライドで途切れると次の章に切り替わる（離れた位置に同じタイトルが再登場した
 * 場合は別の章になる）。章番号は宣言順の1始まりで、章タイトルの重複や表記ゆれをデータ側で持たせない。
 *
 * 章に属さないスライド（表紙・締め等）は meta.section を省略する。装飾テキストの章番号・章タイトル展開
 * （renderMasterText）と、目次スライドの章番号・開始ページの自動整合の共通入力になる。
 */
export function buildSections(slides: SlideData[]): SectionInfo[] {
  const sections: SectionInfo[] = []

  for (const [index, slide] of slides.entries()) {
    const title = slide.meta?.section
    if (!title) continue

    const current = sections[sections.length - 1]
    if (current && current.title === title && current.startIndex + current.slideCount === index) {
      current.slideCount += 1
      continue
    }
    sections.push({ title, number: sections.length + 1, startIndex: index, slideCount: 1 })
  }

  return sections
}

/** index のスライドが属する章を返す（章に属さない場合は undefined） */
export function findSectionAt(sections: SectionInfo[], index: number): SectionInfo | undefined {
  return sections.find((section) => index >= section.startIndex && index < section.startIndex + section.slideCount)
}
