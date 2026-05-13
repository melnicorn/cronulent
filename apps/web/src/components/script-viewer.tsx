'use client'

import dynamic from 'next/dynamic'
import { useTheme } from 'next-themes'
import type { CommandType } from '@repo/common'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

const LANGUAGE: Record<CommandType, string> = {
  'shell': 'shell',
  'python-uv': 'python',
  'node-volta': 'javascript',
  'executable': 'plaintext',
}

interface Props {
  value: string
  commandType: CommandType
}

export function ScriptViewer({ value, commandType }: Props) {
  const { resolvedTheme } = useTheme()
  const lineCount = value.split('\n').length
  const height = Math.min(Math.max(lineCount * 19 + 16, 80), 400)

  return (
    <div className="rounded-md border border-input overflow-hidden">
      <MonacoEditor
        height={`${height}px`}
        language={LANGUAGE[commandType]}
        value={value}
        theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
        options={{
          readOnly: true,
          domReadOnly: true,
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          tabSize: 2,
          renderLineHighlight: 'none',
          contextmenu: false,
        }}
      />
    </div>
  )
}
