'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

export function CodeBlock({ children, language }: { children: string; language?: string }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(children).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <div className="group relative">
      <pre className="p-4 pr-12 rounded-md bg-card border border-border overflow-x-auto">
        <code className="text-[12.5px] text-foreground font-mono leading-relaxed whitespace-pre">
          {children}
        </code>
      </pre>
      <button
        type="button"
        onClick={copy}
        className="absolute top-2.5 right-2.5 inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
        aria-label={copied ? 'Copied' : 'Copy to clipboard'}
        title={copied ? 'Copied' : 'Copy'}
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      {language && (
        <span className="absolute top-2.5 left-2.5 text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity">
          {language}
        </span>
      )}
    </div>
  )
}
