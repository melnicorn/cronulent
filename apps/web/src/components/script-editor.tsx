'use client'

import dynamic from 'next/dynamic'
import { useTheme } from 'next-themes'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

interface Props {
  value: string
  onChange: (value: string) => void
  language?: string
}

export function ScriptEditor({ value, onChange, language = 'shell' }: Props) {
  const { resolvedTheme } = useTheme()

  return (
    <div className="rounded-md border border-input overflow-hidden">
      <MonacoEditor
        height="200px"
        language={language}
        value={value}
        theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
        onChange={v => onChange(v ?? '')}
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
}
