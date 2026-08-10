import { createContext, useContext, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

type Props = {
  src: string
  /** 固定寸法（px）。省略すると縦横比を保って親要素に収める（画像スライドの自動フィット・#198）。
   * 省略時は読み込み失敗の破線プレースホルダも親要素いっぱいに広がり、寸法表記は出さない */
  width?: number
  height?: number
  alt?: string
  className?: string
}

/** true（既定）: `data-src` で出力し Reveal.js の組み込み遅延読み込み（viewDistance 近傍のみ
 * `src` へ昇格）に委ねる。Reveal デッキを持たない静的プレビュー（発表者ビューの前後スライド・
 * 編集画面のライブプレビュー）では viewDistance の昇格が一切走らないため、それらの描画ツリーは
 * false を Provider で渡し、即時に `src` を出す（#224） */
export const LazyImageContext = createContext(true)

/** data-state で読み込み状態を公開する。呼び出し側が「成功した画像にだけ意匠を当てる」等の
 * 状態依存スタイルを、描画される要素（img / プレースホルダの div）に依存せず書けるようにするため */
export function FallbackImage({ src, width, height, alt = '', className }: Props) {
  const lazy = useContext(LazyImageContext)
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const hasSize = width !== undefined && height !== undefined

  if (status === 'error') {
    return (
      <Box
        className={className}
        data-state={status}
        sx={{
          width: hasSize ? width : '100%',
          height: hasSize ? height : '100%',
          border: '1px dashed var(--theme-border-light)',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {hasSize && (
          <Typography
            sx={{
              fontSize: '11px',
              fontFamily: "'Roboto Mono', monospace",
              color: 'var(--theme-text-muted)',
            }}
          >
            {width}px &times; {height}px
          </Typography>
        )}
      </Box>
    )
  }

  return (
    <img
      src={lazy ? undefined : src}
      data-src={lazy ? src : undefined}
      alt={alt}
      className={className}
      data-state={status}
      decoding="async"
      style={{
        ...(hasSize ? { width, height } : { maxWidth: '100%', maxHeight: '100%' }),
        objectFit: 'contain',
        display: status === 'loading' ? 'none' : undefined,
      }}
      onLoad={() => setStatus('loaded')}
      onError={(e) => {
        // `src` 属性が無い = そもそも読み込みを試みていないので、発生した error は無視する。
        // Reveal.js が viewDistance 圏外へ出たスライドの img から `src` を外す（unload）際、
        // その属性除去自体がブラウザによっては error イベントを誘発するのがこの一例
        if (!e.currentTarget.getAttribute('src')) return
        setStatus('error')
      }}
    />
  )
}
