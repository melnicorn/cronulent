'use client'

import dynamic from 'next/dynamic'
import { forwardRef, useImperativeHandle, useRef } from 'react'
import { useTheme } from 'next-themes'

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

export const ScriptEditor = forwardRef<ScriptEditorHandle, Props>(function ScriptEditor(
  { value, onChange, onBlur, language = 'shell' },
  ref,
) {
  const { resolvedTheme } = useTheme()
  const insertRef = useRef<((text: string) => void) | null>(null)
  const insertAtTopRef = useRef<((text: string) => void) | null>(null)

  useImperativeHandle(ref, () => ({
    insert(text: string) {
      insertRef.current?.(text)
    },
    insertAtTop(text: string) {
      insertAtTopRef.current?.(text)
    },
  }))

  return (
    <div className="rounded-md border border-input overflow-hidden bg-card">
      <MonacoEditor
        height="200px"
        language={language}
        value={value}
        theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
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
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          tabSize: 2,
        }}
      />
    </div>
  )
})
