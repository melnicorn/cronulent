'use client'

import dynamic from 'next/dynamic'
import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { Maximize2, Minimize2 } from 'lucide-react'
import { Modal } from '@heroui/react'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

interface Props {
  value: string
  onChange: (value: string) => void
  onBlur?: (value: string) => void
  language?: string
}

export interface ScriptEditorHandle {
  insert(text: string): void
  insertAtTop(text: string): void
}

const EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 13,
  lineNumbers: 'on' as const,
  scrollBeyondLastLine: false,
  wordWrap: 'on' as const,
  tabSize: 2,
}

export const ScriptEditor = forwardRef<ScriptEditorHandle, Props>(function ScriptEditor(
  { value, onChange, onBlur, language = 'shell' },
  ref,
) {
  const { resolvedTheme } = useTheme()
  const insertRef = useRef<((text: string) => void) | null>(null)
  const insertAtTopRef = useRef<((text: string) => void) | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const theme = resolvedTheme === 'dark' ? 'vs-dark' : 'light'

  useImperativeHandle(ref, () => ({
    insert(text: string) {
      insertRef.current?.(text)
    },
    insertAtTop(text: string) {
      insertAtTopRef.current?.(text)
    },
  }))

  return (
    <>
      <div className="relative rounded-md border border-input overflow-hidden bg-card">
        <button
          type="button"
          aria-label="Expand editor"
          className="absolute top-1.5 right-1.5 z-10 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
          onClick={() => setFullscreen(true)}
        >
          <Maximize2 size={12} />
        </button>
        <MonacoEditor
          height="200px"
          language={language}
          value={value}
          theme={theme}
          onChange={v => onChange(v ?? '')}
          onMount={(editor, monaco) => {
            insertRef.current = (text: string) => {
              const position = editor.getPosition()
              const model = editor.getModel()
              if (!model) return
              const pos = position ?? { lineNumber: model.getLineCount(), column: model.getLineMaxColumn(model.getLineCount()) }
              editor.executeEdits('insert-snippet', [{
                range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
                text,
              }])
              editor.focus()
            }
            insertAtTopRef.current = (text: string) => {
              const model = editor.getModel()
              if (!model) return
              editor.executeEdits('insert-at-top', [{
                range: new monaco.Range(1, 1, 1, 1),
                text: text + '\n',
              }])
              editor.focus()
            }
            if (onBlur) editor.onDidBlurEditorText(() => onBlur(editor.getValue()))
          }}
          options={EDITOR_OPTIONS}
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
                  onChange={v => onChange(v ?? '')}
                  options={EDITOR_OPTIONS}
                />
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  )
})
