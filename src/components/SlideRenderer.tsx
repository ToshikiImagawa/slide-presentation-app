import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { LogoConfig, MasterRenderContext, SlideData, ThemeData } from '../data'
import { resolveComponent } from './ComponentRegistry'
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
  const Component = resolveComponent(ref.name)
  const element = <Component {...(ref.props ?? {})} name={ref.name} />
  if (ref.style) {
    return <div style={ref.style}>{element}</div>
  }
  return element
}

/** MUIアイコン名からアイコンコンポーネントを解決する */
function renderIcon(iconName: string): ReactNode {
  const IconComponent = resolveComponent(`Icon:${iconName}`)
  return <IconComponent />
}

/** centerスライドをレンダリング（variant: "section" でSectionLayout） */
function renderCenterSlide(slide: SlideData, logo: LogoConfig | undefined, theme: ThemeData | undefined, ctx: MasterRenderContext): ReactNode {
  const { content } = slide
  const variant = content.variant as string | undefined

  if (variant === 'section') {
    return (
      <SectionLayout id={slide.id} layout={slide.layout} meta={slide.meta} logo={logo} theme={theme} ctx={ctx}>
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
    <TitleLayout id={slide.id} layout={slide.layout} meta={slide.meta} logo={logo} theme={theme} ctx={ctx}>
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

  return (
    <ContentLayout id={slide.id} layout={slide.layout} title={content.title ?? ''} meta={slide.meta} logo={logo} theme={theme} ctx={ctx}>
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
        items={items.map((item, i) => (
          <span key={i}>
            {item.emphasis ? <strong>{item.text}</strong> : item.text}
            {item.description ? ` ${item.description}` : ''}
          </span>
        ))}
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

/** contentスライドの子要素をレンダリング */
function renderContentChildren(content: SlideData['content']): ReactNode {
  // steps があれば Timeline
  if (content.steps) {
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

  // tiles があれば FeatureTileGrid
  if (content.tiles) {
    const tiles = content.tiles as Array<{ icon: string; title: string; description: string }>
    return (
      <FeatureTileGrid
        tiles={tiles.map((tile) => ({
          icon: renderIcon(tile.icon),
          title: tile.title,
          description: renderHtml(tile.description),
        }))}
      />
    )
  }

  // component があればそれを描画
  if (content.component) {
    return renderComponent(content.component)
  }

  return null
}

/** contentスライドをレンダリング */
function renderContentSlide(slide: SlideData, logo: LogoConfig | undefined, theme: ThemeData | undefined, ctx: MasterRenderContext): ReactNode {
  const { content } = slide
  return (
    <ContentLayout id={slide.id} layout={slide.layout} title={content.title ?? ''} meta={slide.meta} logo={logo} theme={theme} ctx={ctx}>
      {renderContentChildren(content)}
    </ContentLayout>
  )
}

/** bleedスライドをレンダリング */
function renderBleedSlide(slide: SlideData, logo: LogoConfig | undefined, theme: ThemeData | undefined, ctx: MasterRenderContext): ReactNode {
  const { content } = slide
  const commands = content.commands as Array<{ text: string; color: string }>

  const leftContent = (
    <>
      <SlideHeading title={content.title ?? ''} description={content.titleDescription as string | undefined} />
      <CommandList commands={commands} sx={{ mt: '20px' }} />
    </>
  )

  const terminalRef = content.component as { name: string; props?: Record<string, unknown>; style?: Record<string, string | number> } | undefined
  const rightContent = terminalRef ? renderComponent(terminalRef) : null

  return <BleedLayout id={slide.id} layout={slide.layout} meta={slide.meta} logo={logo} theme={theme} ctx={ctx} left={leftContent} right={rightContent} />
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
          <SlideFrame id={slide.id} layout={slide.layout} meta={slide.meta} logo={logo} theme={theme} ctx={ctx}>
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
  return (
    <>
      {slides.map((slide, index) => (
        <SlideRenderer.Slide key={slide.id} slide={slide} index={index} total={slides.length} logo={logo} theme={theme} />
      ))}
    </>
  )
}

/** 個別スライドコンポーネント。index/total は masterMap 装飾のページ番号・only 判定に使う（3経路: 本編・発表者ビュー・編集プレビューで必須） */
SlideRenderer.Slide = function SlideRendererSlide({ slide, index, total, logo, theme }: { slide: SlideData; index: number; total: number; logo?: LogoConfig; theme?: ThemeData }) {
  const ctx: MasterRenderContext = { index, total }
  return <>{renderSlide(slide, logo, theme, ctx)}</>
}
