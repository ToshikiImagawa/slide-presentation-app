import type { ComponentType, ReactNode } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { ContentItem, LogoConfig, MasterRenderContext, SectionInfo, SlideContent, SlideData, ThemeData } from '../data'
import { buildSections, findSectionAt } from '../sections'
import { renderMasterText } from '../masters'
import { componentFillsContentArea, renderRegisteredComponent, resolveComponent } from './ComponentRegistry'
import { SlideErrorBoundary } from './SlideErrorBoundary'
import { BleedLayout, ContentLayout, MessageLayout, SectionLayout, SlideFrame, TitleLayout } from '../layouts'
import type { SlideFrameCommonProps } from '../layouts/SlideFrame'
import { SlideHeading } from './SlideHeading'
import { SubtitleText } from './SubtitleText'
import { BulletList } from './BulletList'
import { TwoColumnGrid, type ColumnSpec } from './TwoColumnGrid'
import { CodeBlockPanel } from './CodeBlockPanel'
import { TitledBulletList } from './TitledBulletList'
import { Checklist } from './Checklist'
import { Toc, type TocItemData } from './Toc'
import { Timeline } from './Timeline'
import { TimelineNode } from './TimelineNode'
import { FeatureTileGrid } from './FeatureTileGrid'
import { ImageFigureGrid } from './ImageFigureGrid'
import { Chart, type ChartSpec } from './chart'
import { Table, type TableSpec } from './table'
import { Compare, type CompareSpec } from './compare'
import { Flow, type FlowStep } from './flow'
import { ClassDiagram, type ClassDiagramSpec, HierarchyDiagram, type HierarchyDiagramSpec, OrgChart, type OrgChartSpec, ServerDiagram, type ServerDiagramSpec } from './structureDiagram'
import { Flowchart, type FlowchartSpec, Gantt, type GanttSpec, Swimlane, type SwimlaneSpec } from './processDiagram'
import { AccentText } from './AccentText'
import { Quote } from './Quote'
import { BigMessage } from './BigMessage'
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

/** 章扉（variant: "section"）の中身 */
function renderSectionBody(content: SlideContent): ReactNode {
  return (
    <>
      <UnderlinedHeading sx={{ mb: '30px' }}>{content.title}</UnderlinedHeading>
      {content.body && (
        <Typography variant="body1" sx={{ fontSize: '24px', maxWidth: '800px', mb: '40px' }}>
          {renderWithLineBreaks(content.body)}
        </Typography>
      )}
      {typeof content.qrCode === 'string' && <QrCodeCard url={content.qrCode} sx={{ mb: '30px' }} />}
      {typeof content.githubRepo === 'string' && <GitHubLink repo={content.githubRepo} sx={{ mt: '10px' }} />}
    </>
  )
}

/** 表紙・まとめ（variant 無指定）の中身 */
function renderTitleBody(content: SlideContent): ReactNode {
  return (
    <>
      <SlideHeading title={content.title ?? ''} variant="h1" sx={{ color: 'var(--theme-text-heading)' }} />
      {content.subtitle && <SubtitleText>{renderWithLineBreaks(content.subtitle)}</SubtitleText>}
    </>
  )
}

/** 引用（variant: "quote"）の中身。改行の扱いは他の種別と同じ renderWithLineBreaks に合わせる（#197） */
function renderQuoteBody(content: SlideContent): ReactNode {
  const quote = content.quote as string | undefined
  const citation = content.citation as string | undefined
  return <Quote citation={citation ? renderWithLineBreaks(citation) : undefined}>{renderWithLineBreaks(quote ?? '')}</Quote>
}

/** 大メッセージ（variant: "message" / "message-inverse"）の中身。全面塗りかどうかはマスターが決めるので描画は共通（#197） */
function renderMessageBody(content: SlideContent): ReactNode {
  const message = content.message as string | undefined
  return <BigMessage note={content.body ? renderWithLineBreaks(content.body) : undefined}>{renderWithLineBreaks(message ?? '')}</BigMessage>
}

/** 締め（variant: "closing"）の中身。結びの一言に連絡先（QR・リポジトリ）を添えられる（#197） */
function renderClosingBody(content: SlideContent): ReactNode {
  return (
    <>
      {renderMessageBody(content)}
      {typeof content.qrCode === 'string' && <QrCodeCard url={content.qrCode} />}
      {typeof content.githubRepo === 'string' && <GitHubLink repo={content.githubRepo} />}
    </>
  )
}

/** center レイアウトのラッパー（いずれもタイトルバーを持たない）。契約は SlideFrameCommonProps（SlideFrame.tsx）が
 * 持つので、特定のラッパーの実装から型を借りない（借りると片方に固有 prop が付いた瞬間に他が代入不可になる） */
type CenterWrapper = ComponentType<SlideFrameCommonProps & { children: ReactNode }>

/**
 * center スライドの variant ごとの描画。**この表が variant の唯一の真実源** で、
 * `schema/slide-content-schema.json` の `layouts.center.contentFields.variant.enum` と対応させる（#197）。
 * variant 無指定は表紙・まとめ（TitleLayout）にフォールバックする。
 */
const CENTER_VARIANTS: Record<string, { wrapper: CenterWrapper; render: (content: SlideContent) => ReactNode }> = {
  section: { wrapper: SectionLayout, render: renderSectionBody },
  quote: { wrapper: MessageLayout, render: renderQuoteBody },
  message: { wrapper: MessageLayout, render: renderMessageBody },
  // 全面塗りバリアント。背景と文字色はマスター（theme.masters[].background と theme.tokens）が持ち、
  // その組が getThemeWarnings のコントラスト検証にかかる（#209）。描画は淡色地の message と共通
  'message-inverse': { wrapper: MessageLayout, render: renderMessageBody },
  closing: { wrapper: MessageLayout, render: renderClosingBody },
}

/** 描画できる center の variant 一覧。schema の enum との一致は SlideRenderer.test.tsx が固定する
 * （片方だけに足すと「描けるのに AI 生成が弾かれる」食い違いが静かに起きる） */
export const CENTER_VARIANT_NAMES: readonly string[] = Object.keys(CENTER_VARIANTS)

/** centerスライドをレンダリング（variant で章扉・引用・大メッセージ・締めに切り替わる） */
function renderCenterSlide(slide: SlideData, logo: LogoConfig | undefined, theme: ThemeData | undefined, ctx: MasterRenderContext): ReactNode {
  const { content } = slide
  const variant = getVariant(content)
  const { wrapper: Wrapper, render } = (variant && CENTER_VARIANTS[variant]) || { wrapper: TitleLayout, render: renderTitleBody }

  return (
    <Wrapper id={slide.id} layout={slide.layout} variant={variant} meta={slide.meta} logo={logo} theme={theme} ctx={ctx}>
      {render(content)}
    </Wrapper>
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

/**
 * カラムコンテンツをレンダリングし、そのカラムを fill ホストにするか（#259）を併せて返す。
 *
 * **描く分岐と fill の判定を同じ 1 か所に置く**（`CONTENT_BRANCHES` と同じ理由。判定を別関数で分岐順ごと
 * 複製すると、分岐を足したときに判定が黙ってズレる）。残り高さを必要とするのは登録側が
 * `fillsContentArea` を宣言したコンポーネントだけで、他のフィールド（heading / paragraphs / items 等）は
 * いずれも内容サイズの要素なので fill にしない。
 * ContentLayout に fill を渡す方法では直らない理由は global.css の fill 変種の契約に記載。
 */
function renderColumnContent(data: Record<string, unknown> | undefined): ColumnSpec {
  if (!data) return { content: null }

  // コンポーネント参照
  if (data.component) {
    const ref = data.component as { name: string; props?: Record<string, unknown>; style?: Record<string, string | number> }
    return { content: renderComponent(ref), fill: componentFillsContentArea(ref.name) }
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

  return { content: elements.length === 1 ? elements[0] : <Box sx={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>{elements}</Box> }
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

/** stepsをTimelineとしてレンダリング（stepColumns 指定で多列の番号付きリストになる・#199） */
function renderSteps(content: SlideContent): ReactNode {
  const steps = content.steps as Array<{ number: number; title: string; description: string; command: string }>
  return (
    <>
      <Timeline
        columns={content.stepColumns as number | undefined}
        items={steps.map((step) => (
          <TimelineNode key={step.number} badge={step.number} title={step.title}>
            {/* 多列時は行数に応じて Timeline.module.css が --timeline-body-size を狭める（未定義なら body2 の既定サイズ） */}
            <Typography variant="body2" sx={{ fontSize: 'var(--timeline-body-size, var(--theme-font-size-body2))' }}>
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

/**
 * dateTimelineを日付付きマイルストーンタイムラインとしてレンダリング（#206）。既存のsteps（連番）と
 * 見た目の基盤（Timeline/TimelineNode）を共有し、バッジの中身だけ番号ではなく日付文字列にする。
 *
 * 日付の間隔は等間隔配置（実際の日付差には比例させない）。マイルストーンは近接した日付が並ぶことも
 * 多く、間隔に比例させると密集して読めなくなるため、順序だけを保証する離散配置に決めた（設計判断）。
 */
function renderDateTimeline(content: SlideContent): ReactNode {
  const milestones = content.dateTimeline as Array<{ date: string; title: string; description?: string }>
  return (
    <Timeline
      items={milestones.map((milestone, i) => (
        <TimelineNode key={i} badge={milestone.date} title={milestone.title}>
          {milestone.description && <Typography variant="body2">{milestone.description}</Typography>}
        </TimelineNode>
      ))}
    />
  )
}

/** checklistをChecklistとしてレンダリング（#199） */
function renderChecklist(content: SlideContent): ReactNode {
  const checklist = content.checklist as Array<{ title: string; description?: string; checked?: boolean }>
  return <Checklist items={checklist.map((item) => ({ title: item.title, description: item.description ? renderHtml(item.description) : undefined, checked: item.checked }))} />
}

/**
 * content.tocを目次としてレンダリングする（#195）。items指定時は手書きモード。省略時はsections（buildSectionsで
 * 導出済み）から章番号・章タイトル・開始ページ番号を自動導出する。開始ページはstartIndex+1
 * （Revealの1始まりのページ表示と一致）。章番号の書式はrenderMasterTextの{sectionNumber:0N}記法を再利用し、
 * 書式解析を複製しない（#191）
 */
function renderToc(content: SlideContent, ctx: MasterRenderContext): ReactNode {
  const toc = content.toc as { items?: Array<{ number?: string; title: string; page: string | number }>; numberFormat?: string; columns?: number }
  const numberFormat = toc.numberFormat ?? '{sectionNumber}'
  const items: TocItemData[] = toc.items
    ? toc.items.map((item) => ({ number: item.number, title: item.title, page: String(item.page) }))
    : (ctx.sections ?? []).map((section) => ({
        number: renderMasterText(numberFormat, { index: section.startIndex, total: ctx.total, section }),
        title: section.title,
        page: String(section.startIndex + 1),
      }))
  return <Toc items={items} columns={toc.columns} />
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
   * component は「広がるかどうか」を描画側が name から知り得ないので、登録側の宣言（traits）を引く関数で受ける。
   * 短縮記法（chart/table 等）も同じ理由で関数で受ける（#274）: 登録名は静的に決まるが、
   * CONTENT_BRANCHES はモジュール評価時に構築される一方 registerDefaultComponents() はその後に実行されるため、
   * 即値化すると常に false に固定されてしまう */
  fill: boolean | ((content: SlideContent) => boolean)
  /** ctx は toc（章からの自動導出・#195）だけが使う。他の分岐は content のみを使うので
   * 引数を減らした関数を渡せる（TSの関数型は引数を減らす方向に代入可能） */
  render: (content: SlideContent, ctx: MasterRenderContext) => ReactNode
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
  // 日付付きマイルストーンタイムライン（#206）はstepsと見た目の基盤を共有するが独立フィールド（既存stepsの描画は変えない）
  { match: (content) => Boolean(content.dateTimeline), fill: false, render: renderDateTimeline },
  { match: (content) => Boolean(content.checklist), fill: () => componentFillsContentArea('Checklist'), render: renderChecklist },
  { match: (content) => Boolean(content.toc) && typeof content.toc === 'object', fill: false, render: renderToc },
  { match: (content) => Boolean(content.tiles), fill: false, render: renderTiles },
  { match: (content) => Boolean(content.images), fill: true, render: renderImages },
  // チャート（#204）・表（#194）は本文領域の残り高さを埋める。fill は登録側（registerDefaults.tsx）の
  // fillsContentArea が単一真実源で、ここでは複製しない（#274）
  { match: (content) => Boolean(content.chart) && typeof content.chart === 'object', fill: () => componentFillsContentArea('Chart'), render: (content) => <Chart {...(content.chart as ChartSpec)} /> },
  { match: (content) => Boolean(content.table) && typeof content.table === 'object', fill: () => componentFillsContentArea('Table'), render: (content) => <Table {...(content.table as TableSpec)} /> },
  // 比較（#200）は2ペインの高さを揃えるためにグリッド自身が本文領域の残り高さを受け取る（#259）
  { match: (content) => Boolean(content.compare) && typeof content.compare === 'object', fill: () => componentFillsContentArea('Compare'), render: (content) => <Compare {...(content.compare as CompareSpec)} /> },
  // 横フロー（#200）は DiagramCanvas に載るので埋める
  { match: (content) => Boolean(content.flow), fill: () => componentFillsContentArea('Flow'), render: (content) => <Flow steps={content.flow as FlowStep[]} /> },
  // 構成図（#205）はいずれも Diagram（DiagramCanvas）に載るので埋める。ノード/エッジの共通データ構造は
  // schema/slide-content-schema.json の structureNode/structureEdge が単一ソース（#206/#207も同じ形に乗る想定）
  {
    match: (content) => Boolean(content.hierarchyDiagram) && typeof content.hierarchyDiagram === 'object',
    fill: () => componentFillsContentArea('HierarchyDiagram'),
    render: (content) => <HierarchyDiagram {...(content.hierarchyDiagram as HierarchyDiagramSpec)} />,
  },
  {
    match: (content) => Boolean(content.serverDiagram) && typeof content.serverDiagram === 'object',
    fill: () => componentFillsContentArea('ServerDiagram'),
    render: (content) => <ServerDiagram {...(content.serverDiagram as ServerDiagramSpec)} />,
  },
  { match: (content) => Boolean(content.orgChart) && typeof content.orgChart === 'object', fill: () => componentFillsContentArea('OrgChart'), render: (content) => <OrgChart {...(content.orgChart as OrgChartSpec)} /> },
  {
    match: (content) => Boolean(content.classDiagram) && typeof content.classDiagram === 'object',
    fill: () => componentFillsContentArea('ClassDiagram'),
    render: (content) => <ClassDiagram {...(content.classDiagram as ClassDiagramSpec)} />,
  },
  // プロセス図（#206）もいずれも Diagram（DiagramCanvas）に載るので埋める。ノード/エッジは構成図と同じ structureNode/structureEdge を再利用する
  { match: (content) => Boolean(content.flowchart) && typeof content.flowchart === 'object', fill: () => componentFillsContentArea('Flowchart'), render: (content) => <Flowchart {...(content.flowchart as FlowchartSpec)} /> },
  { match: (content) => Boolean(content.swimlane) && typeof content.swimlane === 'object', fill: () => componentFillsContentArea('Swimlane'), render: (content) => <Swimlane {...(content.swimlane as SwimlaneSpec)} /> },
  { match: (content) => Boolean(content.gantt) && typeof content.gantt === 'object', fill: () => componentFillsContentArea('Gantt'), render: (content) => <Gantt {...(content.gantt as GanttSpec)} /> },
  { match: (content) => Boolean(content.component), fill: (content) => componentFillsContentArea(content.component!.name), render: (content) => renderComponent(content.component!) },
  // 上のいずれも無指定の場合のみ、プレーン本文（body/items）を描画する（#193）
  { match: (content) => Boolean(content.body) || Boolean(content.items?.length), fill: false, render: renderBody },
]

function resolveContentBranch(content: SlideContent): ContentBranch | undefined {
  return CONTENT_BRANCHES.find((branch) => branch.match(content))
}

/** contentスライドの子要素をレンダリング */
function renderContentChildren(content: SlideContent, ctx: MasterRenderContext): ReactNode {
  return resolveContentBranch(content)?.render(content, ctx) ?? null
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
      {renderContentChildren(content, ctx)}
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

/** renderSlide の呼び出しをReactコンポーネントの中に置く。SlideErrorBoundary は自身より下の
 * 子孫コンポーネントの描画中の例外しか捕捉できないため、renderSlide（renderColumnContent 等、
 * JSXではなく通常の関数呼び出しで配列・オブジェクトにアクセスする箇所を含む）を境界の外側で
 * 直接呼ぶと、その場で投げられた例外は境界に届かず素通りする。SlideErrorBoundary の子として
 * このコンポーネントを置くことで、renderSlide の呼び出し自体がReactの描画フェーズ内（境界の
 * 子孫の実行）で行われるようにし、同期例外も確実に捕捉できるようにする（#280） */
function SlideBody({ slide, logo, theme, ctx }: { slide: SlideData; logo?: LogoConfig; theme?: ThemeData; ctx: MasterRenderContext }) {
  return <>{renderSlide(slide, logo, theme, ctx)}</>
}

/** 個別スライドコンポーネント。index/total/sections は masterMap 装飾のページ番号・章情報・only 判定に使う
 * （3経路: 本編・発表者ビュー・編集プレビューで必須）。sections はデッキ全体から buildSections で導出した章で、
 * 章を持たないデッキでは空配列を渡す（省略可にすると配線もれが「章が無い」として静かに埋もれる・#191）。
 * SlideErrorBoundary で包むことで、本編・PDF・発表者ビュー・編集プレビューの4経路すべてを1箇所で
 * カバーする（1スライドの描画例外がデッキ全体を白画面にしない・#280）。
 * key={slide.id} は、発表者ビュー（PresenterViewWindow）・編集プレビュー（SlidePreview）が
 * 同一の SlideRenderer.Slide インスタンスを再利用したまま slide だけ差し替える経路のため。
 * key を付けないと、あるスライドで一度例外が起きた後、別の正常なスライドに切り替えても
 * フォールバックが表示され続ける（Reactのエラーバウンダリは props 変化で自動リセットしない） */
SlideRenderer.Slide = function SlideRendererSlide({ slide, index, total, sections, logo, theme }: { slide: SlideData; index: number; total: number; sections: SectionInfo[]; logo?: LogoConfig; theme?: ThemeData }) {
  const ctx: MasterRenderContext = { index, total, section: findSectionAt(sections, index), sections }
  return (
    <SlideErrorBoundary key={slide.id}>
      <SlideBody slide={slide} logo={logo} theme={theme} ctx={ctx} />
    </SlideErrorBoundary>
  )
}
