import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { ContentItem, LogoConfig, MasterRenderContext, SectionInfo, SlideContent, SlideData, ThemeData } from '../data'
import { buildSections, findSectionAt } from '../sections'
import { componentFillsContentArea, renderRegisteredComponent, resolveComponent } from './ComponentRegistry'
import { BleedLayout, ContentLayout, SectionLayout, SlideFrame, TitleLayout } from '../layouts'
import { SlideHeading } from './SlideHeading'
import { SubtitleText } from './SubtitleText'
import { BulletList } from './BulletList'
import { TwoColumnGrid } from './TwoColumnGrid'
import { CodeBlockPanel } from './CodeBlockPanel'
import { TitledBulletList } from './TitledBulletList'
import { Timeline } from './Timeline'
import { TimelineNode } from './TimelineNode'
import { FeatureTileGrid } from './FeatureTileGrid'
import { ImageFigureGrid } from './ImageFigureGrid'
import { Chart, type ChartSpec } from './chart'
import { Table, type TableSpec } from './table'
import { Compare, type CompareSpec } from './compare'
import { Flow, type FlowStep } from './flow'
import { AccentText } from './AccentText'
import { CommandList } from './CommandList'
import { UnderlinedHeading } from './UnderlinedHeading'
import { QrCodeCard } from './QrCodeCard'
import { GitHubLink } from './GitHubLink'

type SlideRendererProps = {
  slides: SlideData[]
  logo?: LogoConfig
  theme?: ThemeData
}

/** HTMLタグを含む文字列をReactNodeに変換する */
function renderHtml(text: string): ReactNode {
  if (/<[^>]+>/.test(text)) {
    return <span dangerouslySetInnerHTML={{ __html: text }} />
  }
  return text
}

/** 改行を含む文字列をbrタグで分割する */
function renderWithLineBreaks(text: string): ReactNode {
  const lines = text.split('\n')
  if (lines.length === 1) return renderHtml(text)
  return lines.map((line, i) => (
    <span key={i}>
      {i > 0 && <br />}
      {renderHtml(line)}
    </span>
  ))
}

/** カスタムコンポーネントを解決しレンダリングする */
function renderComponent(ref: { name: string; props?: Record<string, unknown>; style?: Record<string, string | number> }): ReactNode {
  const element = renderRegisteredComponent(ref.name, ref.props)
  if (ref.style) {
    return <div style={ref.style}>{element}</div>
  }
  return element
}

/** icon名からComponentRegistry登録済みのアイコンコンポーネントを解決する。未登録名の利用者向け警告はgetThemeWarnings（applyTheme.ts）が担う */
function renderIcon(iconName: string): ReactNode {
  const IconComponent = resolveComponent(`Icon:${iconName}`)
  return <IconComponent />
}

/** content.variant を取り出す（masterMap["layout/variant"] 解決に使う・#185） */
function getVariant(content: SlideData['content']): string | undefined {
  return content.variant as string | undefined
}

/** centerスライドをレンダリング（variant: "section" でSectionLayout） */
function renderCenterSlide(slide: SlideData, logo: LogoConfig | undefined, theme: ThemeData | undefined, ctx: MasterRenderContext): ReactNode {
  const { content } = slide
  const variant = getVariant(content)

  if (variant === 'section') {
    return (
      <SectionLayout id={slide.id} layout={slide.layout} variant={variant} meta={slide.meta} logo={logo} theme={theme} ctx={ctx}>
        <UnderlinedHeading sx={{ mb: '30px' }}>{content.title}</UnderlinedHeading>
        {content.body && (
          <Typography variant="body1" sx={{ fontSize: '24px', maxWidth: '800px', mb: '40px' }}>
            {renderWithLineBreaks(content.body)}
          </Typography>
        )}
        {typeof content.qrCode === 'string' && <QrCodeCard url={content.qrCode} sx={{ mb: '30px' }} />}
        {typeof content.githubRepo === 'string' && <GitHubLink repo={content.githubRepo} sx={{ mt: '10px' }} />}
      </SectionLayout>
    )
  }

  return (
    <TitleLayout id={slide.id} layout={slide.layout} variant={variant} meta={slide.meta} logo={logo} theme={theme} ctx={ctx}>
      <SlideHeading title={content.title ?? ''} variant="h1" sx={{ color: 'var(--theme-text-heading)' }} />
      {content.subtitle && <SubtitleText>{renderWithLineBreaks(content.subtitle)}</SubtitleText>}
    </TitleLayout>
  )
}

/** 2カラムスライドをレンダリング */
function renderTwoColumnSlide(slide: SlideData, logo: LogoConfig | undefined, theme: ThemeData | undefined, ctx: MasterRenderContext): ReactNode {
  const { content } = slide
  const leftData = content.left as Record<string, unknown> | undefined
  const rightData = content.right as Record<string, unknown> | undefined
  const variant = getVariant(content)

  return (
    <ContentLayout id={slide.id} layout={slide.layout} variant={variant} title={content.title ?? ''} meta={slide.meta} logo={logo} theme={theme} ctx={ctx}>
      <TwoColumnGrid left={renderColumnContent(leftData)} right={renderColumnContent(rightData)} />
    </ContentLayout>
  )
}

/** カラムコンテンツをレンダリング */
function renderColumnContent(data: Record<string, unknown> | undefined): ReactNode {
  if (!data) return null

  // コンポーネント参照
  if (data.component) {
    const ref = data.component as { name: string; props?: Record<string, unknown>; style?: Record<string, string | number> }
    return renderComponent(ref)
  }

  const elements: ReactNode[] = []

  // 見出し
  if (data.heading) {
    elements.push(<SlideHeading key="heading" title={data.heading as string} variant="h3" description={data.headingDescription as string | undefined} />)
  }

  // 段落
  if (data.paragraphs) {
    const paragraphs = data.paragraphs as string[]
    paragraphs.forEach((p, i) => {
      elements.push(
        <Typography key={`p-${i}`} variant="body1" sx={i === 0 ? { mb: '16px' } : undefined}>
          {renderHtml(p)}
        </Typography>,
      )
    })
  }

  // リスト項目
  if (data.items) {
    const items = data.items as Array<{ text: string; emphasis?: boolean; description?: string }>
    elements.push(
      <BulletList
        key="items"
        items={items.map((item) => ({
          content: (
            <>
              {item.emphasis ? <strong>{item.text}</strong> : item.text}
              {item.description ? ` ${item.description}` : ''}
            </>
          ),
        }))}
      />,
    )
  }

  // コードブロック
  if (data.codeBlock) {
    const block = data.codeBlock as { header: string; items: string[] }
    elements.push(
      <CodeBlockPanel
        key="codeBlock"
        header={renderHtml(block.header)}
        items={block.items.map((item, i) => (
          <span key={i}>{renderHtml(item)}</span>
        ))}
      />,
    )
  }

  // TitledBulletList
  if (data.titledBulletList) {
    const list = data.titledBulletList as { title: string; items: string[] }
    elements.push(
      <TitledBulletList
        key="titledBulletList"
        title={list.title}
        items={list.items.map((item, i) => (
          <span key={i}>{renderHtml(item)}</span>
        ))}
      />,
    )
  }

  // アクセントテキスト
  if (data.accentText) {
    elements.push(<AccentText key="accentText">{data.accentText as string}</AccentText>)
  }

  // QRコード
  if (typeof data.qrCode === 'string') {
    elements.push(<QrCodeCard key="qrCode" url={data.qrCode} />)
  }

  return elements.length === 1 ? elements[0] : <Box sx={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>{elements}</Box>
}

/** ContentItem配列を再帰的に箇条書きとしてレンダリング（ネスト可・#193） */
function renderContentItems(items: ContentItem[]): ReactNode {
  return (
    <BulletList
      items={items.map((item) => ({
        content: item.emphasis ? <strong>{renderHtml(item.text)}</strong> : renderHtml(item.text),
        fragment: item.fragment,
        fragmentIndex: item.fragmentIndex,
        children: item.items && item.items.length > 0 ? <Box sx={{ pl: '20px', mt: '4px' }}>{renderContentItems(item.items)}</Box> : undefined,
      }))}
    />
  )
}

/** stepsをTimelineとしてレンダリング */
function renderSteps(content: SlideContent): ReactNode {
  const steps = content.steps as Array<{ number: number; title: string; description: string; command: string }>
  return (
    <>
      <Timeline
        items={steps.map((step) => (
          <TimelineNode key={step.number} number={step.number} title={step.title}>
            <Typography variant="body2">
              {step.description}
              {step.command && (
                <>
                  <br />
                  <code>{step.command}</code>
                </>
              )}
            </Typography>
          </TimelineNode>
        ))}
      />
      {typeof content.footer === 'string' && (
        <Typography variant="body1" sx={{ textAlign: 'center', mt: '40px', fontStyle: 'italic' }}>
          {content.footer}
        </Typography>
      )}
    </>
  )
}

/** tilesをFeatureTileGridとしてレンダリング */
function renderTiles(content: SlideContent): ReactNode {
  const tiles = content.tiles as Array<{ icon: string; title: string; description: string; accentColor?: string }>
  return (
    <FeatureTileGrid
      columns={content.tileColumns as number | undefined}
      tiles={tiles.map((tile) => ({
        icon: renderIcon(tile.icon),
        title: tile.title,
        description: renderHtml(tile.description),
        accentColor: tile.accentColor,
      }))}
    />
  )
}

/** imagesをImageFigureGridとしてレンダリング（画像スライド・#198） */
function renderImages(content: SlideContent): ReactNode {
  const images = content.images as Array<{ src: string; alt?: string; caption?: string }>
  return <ImageFigureGrid images={images.map((image) => ({ src: image.src, alt: image.alt, caption: image.caption ? renderHtml(image.caption) : undefined }))} />
}

/** プレーン本文（body/items）をレンダリング（#193） */
function renderBody(content: SlideContent): ReactNode {
  const { body } = content
  const items = content.items && content.items.length > 0 ? content.items : undefined
  return (
    <>
      {body && (
        <Typography variant="body1" sx={{ fontSize: '20px', lineHeight: 1.6, color: 'var(--theme-text-body)', mb: items ? '20px' : undefined }}>
          {renderWithLineBreaks(body)}
        </Typography>
      )}
      {items && renderContentItems(items)}
    </>
  )
}

type ContentBranch = {
  /** この分岐を選ぶ条件 */
  match: (content: SlideContent) => boolean
  /** 本文領域を .content-area の fill 変種にするか（#225）。
   * component は「広がるかどうか」を描画側が name から知り得ないので、登録側の宣言（traits）を引く関数で受ける */
  fill: boolean | ((content: SlideContent) => boolean)
  render: (content: SlideContent) => ReactNode
}

/**
 * contentスライドの子要素の描画分岐。**この配列の順序が優先順位の唯一の真実源** で、
 * 本文領域を埋めるか（fill）も同じ行に併記する（#256）。
 *
 * 以前は fillsContentArea がこの分岐順を人力で複製していたため、分岐を足すと判定が黙ってズレた。
 * fill: true の分岐が描く要素のルートには .content-area-fill-item が必要（global.css・#225）で、
 * その対応は SlideRenderer.test.tsx が全分岐について検査する（付け忘れると主軸配置が stretch に変わる）。
 */
const CONTENT_BRANCHES: ContentBranch[] = [
  { match: (content) => Boolean(content.steps), fill: false, render: renderSteps },
  { match: (content) => Boolean(content.tiles), fill: false, render: renderTiles },
  { match: (content) => Boolean(content.images), fill: true, render: renderImages },
  // チャート（#204）・表（#194）は本文領域の残り高さを埋める
  { match: (content) => Boolean(content.chart) && typeof content.chart === 'object', fill: true, render: (content) => <Chart {...(content.chart as ChartSpec)} /> },
  { match: (content) => Boolean(content.table) && typeof content.table === 'object', fill: true, render: (content) => <Table {...(content.table as TableSpec)} /> },
  // 比較（#200）は2ペインがグリッドの stretch で高さを揃えるため fill 変種は使わない
  { match: (content) => Boolean(content.compare) && typeof content.compare === 'object', fill: false, render: (content) => <Compare {...(content.compare as CompareSpec)} /> },
  // 横フロー（#200）は DiagramCanvas に載るので埋める
  { match: (content) => Boolean(content.flow), fill: true, render: (content) => <Flow steps={content.flow as FlowStep[]} /> },
  { match: (content) => Boolean(content.component), fill: (content) => componentFillsContentArea(content.component!.name), render: (content) => renderComponent(content.component!) },
  // 上のいずれも無指定の場合のみ、プレーン本文（body/items）を描画する（#193）
  { match: (content) => Boolean(content.body) || Boolean(content.items?.length), fill: false, render: renderBody },
]

function resolveContentBranch(content: SlideContent): ContentBranch | undefined {
  return CONTENT_BRANCHES.find((branch) => branch.match(content))
}

/** contentスライドの子要素をレンダリング */
function renderContentChildren(content: SlideContent): ReactNode {
  return resolveContentBranch(content)?.render(content) ?? null
}

/** 本文領域の残り高さいっぱいに広がる子を描くか（.content-area の fill 変種・#225） */
function fillsContentArea(content: SlideContent): boolean {
  const { fill } = resolveContentBranch(content) ?? {}
  return typeof fill === 'function' ? fill(content) : fill === true
}

/** contentスライドをレンダリング */
function renderContentSlide(slide: SlideData, logo: LogoConfig | undefined, theme: ThemeData | undefined, ctx: MasterRenderContext): ReactNode {
  const { content } = slide
  const variant = getVariant(content)
  return (
    <ContentLayout id={slide.id} layout={slide.layout} variant={variant} title={content.title ?? ''} meta={slide.meta} logo={logo} theme={theme} ctx={ctx} fill={fillsContentArea(content)}>
      {renderContentChildren(content)}
    </ContentLayout>
  )
}

/** bleedスライドをレンダリング */
function renderBleedSlide(slide: SlideData, logo: LogoConfig | undefined, theme: ThemeData | undefined, ctx: MasterRenderContext): ReactNode {
  const { content } = slide
  const commands = content.commands as Array<{ text: string; color: string }>
  const variant = getVariant(content)

  const leftContent = (
    <>
      <SlideHeading title={content.title ?? ''} description={content.titleDescription as string | undefined} />
      <CommandList commands={commands} sx={{ mt: '20px' }} />
    </>
  )

  const terminalRef = content.component as { name: string; props?: Record<string, unknown>; style?: Record<string, string | number> } | undefined
  const rightContent = terminalRef ? renderComponent(terminalRef) : null

  return <BleedLayout id={slide.id} layout={slide.layout} variant={variant} meta={slide.meta} logo={logo} theme={theme} ctx={ctx} left={leftContent} right={rightContent} />
}

/** 単一スライドをレイアウト種別に応じてレンダリング */
function renderSlide(slide: SlideData, logo: LogoConfig | undefined, theme: ThemeData | undefined, ctx: MasterRenderContext): ReactNode {
  switch (slide.layout) {
    case 'center':
      return renderCenterSlide(slide, logo, theme, ctx)
    case 'two-column':
      return renderTwoColumnSlide(slide, logo, theme, ctx)
    case 'content':
      return renderContentSlide(slide, logo, theme, ctx)
    case 'bleed':
      return renderBleedSlide(slide, logo, theme, ctx)
    case 'custom': {
      const ref = slide.content.component
      if (ref)
        return (
          <SlideFrame id={slide.id} layout={slide.layout} variant={getVariant(slide.content)} meta={slide.meta} logo={logo} theme={theme} ctx={ctx}>
            {renderComponent(ref)}
          </SlideFrame>
        )
      return null
    }
    default:
      return renderCenterSlide(slide, logo, theme, ctx)
  }
}

/** スライドデータ配列からReact要素を生成するレンダラー */
export function SlideRenderer({ slides, logo, theme }: SlideRendererProps) {
  const sections = buildSections(slides)
  return (
    <>
      {slides.map((slide, index) => (
        <SlideRenderer.Slide key={slide.id} slide={slide} index={index} total={slides.length} sections={sections} logo={logo} theme={theme} />
      ))}
    </>
  )
}

/** 個別スライドコンポーネント。index/total/sections は masterMap 装飾のページ番号・章情報・only 判定に使う
 * （3経路: 本編・発表者ビュー・編集プレビューで必須）。sections はデッキ全体から buildSections で導出した章で、
 * 章を持たないデッキでは空配列を渡す（省略可にすると配線もれが「章が無い」として静かに埋もれる・#191） */
SlideRenderer.Slide = function SlideRendererSlide({ slide, index, total, sections, logo, theme }: { slide: SlideData; index: number; total: number; sections: SectionInfo[]; logo?: LogoConfig; theme?: ThemeData }) {
  const ctx: MasterRenderContext = { index, total, section: findSectionAt(sections, index) }
  return <>{renderSlide(slide, logo, theme, ctx)}</>
}
