import { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import styles from './TerminalAnimation.module.css'

const TYPING_SPEED = 40
const COMMAND_DONE_PAUSE = 400
const OUTPUT_LINE_INTERVAL = 150
const EMPTY_LINE_INTERVAL = 80
const RESTART_DELAY = 2000

function getLineClassName(line: string): string {
  if (line.startsWith('$')) return styles['line-command']
  if (line.startsWith('\u2713')) return styles['line-success']
  if (line.startsWith('\u26A0')) return styles['line-warning']
  if (line.startsWith('\u2717')) return styles['line-error']
  if (line.startsWith('>')) return styles['line-accent']
  return styles['line-default']
}

function isCommandLine(line: string): boolean {
  return line.startsWith('$')
}

type Props = {
  logText?: string
  logTextUrl?: string
  title?: string
}

export function TerminalAnimation({ logText, logTextUrl, title = 'Terminal' }: Props) {
  const [resolvedText, setResolvedText] = useState(logText ?? '')

  useEffect(() => {
    if (logTextUrl) {
      fetch(logTextUrl)
        .then((res) => {
          if (!res.ok) throw new Error(`${res.status}`)
          const ct = res.headers.get('content-type') ?? ''
          if (ct.includes('text/html')) throw new Error('unexpected html response')
          return res.text()
        })
        .then(setResolvedText)
        .catch(() => {
          if (logText) setResolvedText(logText)
        })
    } else if (logText) {
      setResolvedText(logText)
    }
  }, [logText, logTextUrl])

  const lines = resolvedText.split('\n')
  const terminalBodyRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [lineIndex, setLineIndex] = useState(0)
  const [charIndex, setCharIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (terminalBodyRef.current) {
      terminalBodyRef.current.scrollTop = terminalBodyRef.current.scrollHeight
    }
  }, [lineIndex])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.5 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) {
      setLineIndex(0)
      setCharIndex(0)
    }
  }, [visible])

  useEffect(() => {
    if (!visible) return

    if (lineIndex >= lines.length) {
      const timer = setTimeout(() => {
        setLineIndex(0)
        setCharIndex(0)
      }, RESTART_DELAY)
      return () => clearTimeout(timer)
    }

    const currentLine = lines[lineIndex]

    if (isCommandLine(currentLine)) {
      if (charIndex < currentLine.length) {
        const timer = setTimeout(() => setCharIndex((c) => c + 1), TYPING_SPEED)
        return () => clearTimeout(timer)
      }
      const timer = setTimeout(() => {
        setLineIndex((l) => l + 1)
        setCharIndex(0)
      }, COMMAND_DONE_PAUSE)
      return () => clearTimeout(timer)
    }

    const delay = currentLine.trim() === '' ? EMPTY_LINE_INTERVAL : OUTPUT_LINE_INTERVAL
    const timer = setTimeout(() => {
      setLineIndex((l) => l + 1)
      setCharIndex(0)
    }, delay)
    return () => clearTimeout(timer)
  }, [visible, lineIndex, charIndex, lines])

  return (
    <Box ref={containerRef} className={styles['terminal-window']}>
      <Box className={styles['terminal-titlebar']}>
        <span className={`${styles['terminal-dot']} ${styles['terminal-dot-red']}`} />
        <span className={`${styles['terminal-dot']} ${styles['terminal-dot-yellow']}`} />
        <span className={`${styles['terminal-dot']} ${styles['terminal-dot-green']}`} />
        <span className={styles['terminal-title']}>{title}</span>
      </Box>
      <Box ref={terminalBodyRef} className={styles['terminal-body']}>
        {lines.map((line, i) => {
          if (i > lineIndex) {
            return (
              <div key={i} className={`${styles['terminal-line']} ${styles['line-hidden']}`}>
                {line || '\u00A0'}
              </div>
            )
          }

          if (i === lineIndex && isCommandLine(line)) {
            return (
              <div key={i} className={`${styles['terminal-line']} ${styles['line-visible']} ${getLineClassName(line)}`}>
                {line.slice(0, charIndex)}
                <span className={styles.cursor} />
              </div>
            )
          }

          if (i === lineIndex) {
            return (
              <div key={i} className={`${styles['terminal-line']} ${styles['line-hidden']}`}>
                {line || '\u00A0'}
              </div>
            )
          }

          return (
            <div key={i} className={`${styles['terminal-line']} ${styles['line-visible']} ${getLineClassName(line)}`}>
              {line || '\u00A0'}
            </div>
          )
        })}
      </Box>
    </Box>
  )
}
