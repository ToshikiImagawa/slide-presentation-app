import type { ReactNode } from 'react'
import type { ConfidentialConfig, LogoConfig, MasterRenderContext, SlideMeta, ThemeData } from '../data'
import { resolveSectionAccent } from '../applyTheme'
import { confidentialToDecoration, logoToDecoration, resolveMaster, resolveSlideConfidential, resolveSlideLogo } from '../masters'
import { SlideMasterLayer } from './SlideMasterLayer'

/** 4つのレイアウトラッパー（TitleLayout等）と SlideFrame が共通で受け取るprops。SlideFrame にpropsを
 * 追加する際はここに1箇所加えるだけでよい（各レイアウトファイルの型定義を個別に追随させない） */
export type SlideFrameCommonProps = {
  id: string
  /** SlideData.layout の値。masterMap 解決に使う */
  layout: string
  /** SlideData.content.variant の値。masterMap["<layout>/<variant>"] 解決に使う（#185） */
  variant?: string
  meta?: SlideMeta
  logo?: LogoConfig
  confidential?: ConfidentialConfig
  theme?: ThemeData
  ctx: MasterRenderContext
}

type Props = SlideFrameCommonProps & {
  /** .master-body を余白なしの2カラムgridにする（未指定なら通常のflex中央寄せ） */
  bleed?: boolean
  children: ReactNode
}

/** 5レイアウト共通の section 生成を担う。.master-layer-back/front の中身は resolveMaster が解決した
 * master を渡して SlideMasterLayer に任せる（優先順: meta.master → masterMap["layout/variant"] →
 * masterMap["layout"]）。master が未解決（未指定・masterKey不明・extends循環）の場合は現行と完全同一の
 * DOMになる。meta.logo/meta.confidential は独自描画を持たず、LogoMasterDecoration/TextMasterDecoration に
 * 合成してマスター装飾の末尾（前面）に追加することで同じ描画経路に載せる（#350・#394）。
 * meta.backgroundColor/backgroundImage は SlideMasterLayer の back レイヤーで描く（#236）。Reveal.js の
 * 背景レイヤー（data-background-*・.backgrounds）は本編でしか効かないため使わない。
 * 余白は section ではなく .master-body に持たせることで、本編・発表者ビュー・編集プレビュー・PDF書き出しの
 * 4経路の見た目を一致させる。
 * meta.logo/meta.confidential は slides[].meta.logo/meta.confidential（スライド個別上書き・#393）で
 * フィールド単位に上書きできる。個別スライド指定が優先する（meta.backgroundColor/backgroundImage と
 * 同型の優先順位）。resolveSlideLogo/resolveSlideConfidential が hidden 判定とマージを担う（masters.ts）。
 * 章（meta.section から導出）に属するスライドには data-section-number（章番号。customCSS から章を狙う用途）と
 * data-section-accent（章色のカラートークン名）を付ける。後者は buildSectionAccentCss（applyTheme.ts）が
 * 出力する章スコープの CSS 変数上書きが効くスコープになる（#319）。章に属さないスライドは属性を持たないため
 * 章色の上書きも効かない */
export function SlideFrame({ id, layout, variant, meta, logo, confidential, theme, ctx, bleed, children }: Props) {
  const resolved = resolveMaster(theme, layout, { master: meta?.master, variant })
  const sectionNumber = ctx.section?.number
  const sectionAccent = sectionNumber === undefined ? undefined : resolveSectionAccent(theme?.sectionAccents, sectionNumber)

  const effectiveLogo = resolveSlideLogo(logo, meta?.logo)
  const effectiveConfidential = resolveSlideConfidential(confidential, meta?.confidential)

  const effectiveMaster =
    !effectiveLogo && !effectiveConfidential
      ? resolved
      : { decorations: [...(resolved?.decorations ?? []), ...(effectiveLogo ? [logoToDecoration(effectiveLogo)] : []), ...(effectiveConfidential ? [confidentialToDecoration(effectiveConfidential)] : [])], background: resolved?.background }

  return (
    <section className="slide-container" id={id} data-master={resolved?.masterKey} data-section-number={sectionNumber} data-section-accent={sectionAccent} data-transition={meta?.transition}>
      <div className="master-layer-back">
        <SlideMasterLayer master={effectiveMaster} layer="back" ctx={ctx} meta={meta} />
      </div>
      <div className={bleed ? 'master-body bleed-image-layout' : 'master-body'}>{children}</div>
      <div className="master-layer-front">
        <SlideMasterLayer master={effectiveMaster} layer="front" ctx={ctx} />
      </div>
    </section>
  )
}
