'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useTheme } from 'next-themes'
import { Maximize2, Minimize2 } from 'lucide-react'
import { Modal } from '@heroui/react'
import type { CommandType } from '@repo/common'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

const LANGUAGE: Record<CommandType, string> = {
  'shell': 'shell',
  'python-uv': 'python',
  'node-volta': 'javascript',
}

const VIEWER_OPTIONS = {
  readOnly: true,
  domReadOnly: true,
  minimap: { enabled: false },
  fontSize: 13,
  lineNumbers: 'on' as const,
  scrollBeyondLastLine: false,
  wordWrap: 'on' as const,
  tabSize: 2,
  renderLineHighlight: 'none' as const,
  contextmenu: false,
}

interface Props {
  value: string
  commandType: CommandType
}

export function ScriptViewer({ value, commandType }: Props) {
  const { resolvedTheme } = useTheme()
  const [fullscreen, setFullscreen] = useState(false)
  const lineCount = value.split('\n').length
  const height = Math.min(Math.max(lineCount * 19 + 16, 80), 400)
  const theme = resolvedTheme === 'dark' ? 'vs-dark' : 'light'
  const language = LANGUAGE[commandType]

  return (
    <>
      <div className="relative rounded-md border border-input overflow-hidden">
        <button
          type="button"
          aria-label="Expand editor"
          className="absolute top-1.5 right-1.5 z-10 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
          onClick={() => setFullscreen(true)}
        >
          <Maximize2 size={12} />
        </button>
        <MonacoEditor
          height={`${height}px`}
          language={language}
          value={value}
          theme={theme}
          options={VIEWER_OPTIONS}
        />
      </div>

      <Modal isOpen={fullscreen} onOpenChange={setFullscreen}>
        <Modal.Backdrop>
          <Modal.Container size="full">
            <Modal.Dialog>
              <Modal.Header>
                <div className="flex items-center justify-between w-full">
                  <Modal.Heading>Script</Modal.Heading>
                  <button
                    type="button"
                    aria-label="Exit fullscreen"
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
                    onClick={() => setFullscreen(false)}
                  >
                    <Minimize2 size={14} />
                  </button>
                </div>
              </Modal.Header>
              <Modal.Body className="p-0">
                <MonacoEditor
                  height="calc(100vh - 130px)"
                  language={language}
                  value={value}
                  theme={theme}
                  options={VIEWER_OPTIONS}
                />
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  )
}
