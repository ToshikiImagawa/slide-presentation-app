import type { ReactNode } from 'react'
import { FallbackImage } from './FallbackImage'
import styles from './Profile.module.css'

type ProfileLink = {
  /** 連絡先の種類を表すアイコン（icon 名の解決は呼び出し側の renderIcon が済ませた ReactNode） */
  icon: ReactNode
  /** 表示文字列（メールアドレス・アカウント名等）。投影が主なのでリンク化はしない */
  label: string
}

type Props = {
  /** 顔写真・アバター。省略時は写真の区画そのものを描かない（テキストだけの1カラムになる） */
  image?: string
  name: string
  /** 氏名の併記（ローマ字表記・読み等） */
  nameSub?: string
  /** 役割・肩書き */
  role?: string
  /** 所属 */
  org?: string
  /** 自己紹介文（改行の解釈は呼び出し側の renderWithLineBreaks が済ませた ReactNode） */
  body?: ReactNode
  links?: ProfileLink[]
}

/**
 * プロフィール（自己紹介）スライドの本体（#324）。1人ぶんの写真・氏名・併記・肩書き・所属・自己紹介文・
 * 連絡先を、写真とテキストの2区画で見せる。色はテーマの文字色トークンだけを使い、背景は塗らない
 * （全面塗りはマスター側 theme.masters[].background の責務。Quote と同じ方針）。
 *
 * 写真は ImageFigureGrid（#198）と同じ FallbackImage 経路に載せる。読み込み失敗時は破線の
 * プレースホルダになり、`image` 未指定時は区画自体を描かないので、どちらの場合もレイアウトは崩れない。
 * 高さの確定は ContentLayout の fill 変種（global.css の .content-area-fill-item・#225）から受け取る。
 */
export function Profile({ image, name, nameSub, role, org, body, links }: Props) {
  return (
    <div className={`content-area-fill-item ${styles.profile}`} data-testid="profile">
      {image && (
        <div className={styles.photo}>
          <FallbackImage src={image} alt={name} className={styles.photoImage} />
        </div>
      )}
      <div className={styles.details}>
        <p className={styles.name}>{name}</p>
        {nameSub && <p className={styles.nameSub}>{nameSub}</p>}
        {role && <p className={styles.role}>{role}</p>}
        {org && <p className={styles.org}>{org}</p>}
        {body && <p className={styles.body}>{body}</p>}
        {links && links.length > 0 && (
          <ul className={styles.links}>
            {links.map((link, i) => (
              <li key={i} className={styles.link}>
                <span className={styles.linkIcon} aria-hidden="true">
                  {link.icon}
                </span>
                <span className={styles.linkLabel}>{link.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
