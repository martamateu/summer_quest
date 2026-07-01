'use client'

import { useState } from 'react'
import { X, Copy, Download, Printer, Check } from 'lucide-react'

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function ReportExportModal({
  title,
  filename,
  text,
  onClose,
}: {
  title: string
  filename: string
  text: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard may be unavailable */
    }
  }

  const download = () => {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const printPdf = () => {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(
      `<html><head><title>${escapeHtml(title)}</title>` +
        `<meta name="viewport" content="width=device-width, initial-scale=1">` +
        `<style>body{font-family:-apple-system,system-ui,sans-serif;padding:24px;color:#111;line-height:1.5}pre{white-space:pre-wrap;font-family:inherit;font-size:14px;margin:0}</style>` +
        `</head><body><pre>${escapeHtml(text)}</pre></body></html>`
    )
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-background w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-secondary">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-3">
          Cópialo o descárgalo para añadirlo a NotebookLM como fuente.
        </p>

        <pre className="flex-1 overflow-auto text-xs text-foreground bg-secondary rounded-xl p-3 mb-4 whitespace-pre-wrap">
          {text}
        </pre>

        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={copy}
            className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
          <button
            onClick={download}
            className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-secondary text-foreground text-xs font-medium"
          >
            <Download className="w-4 h-4" />
            .md
          </button>
          <button
            onClick={printPdf}
            className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-secondary text-foreground text-xs font-medium"
          >
            <Printer className="w-4 h-4" />
            PDF
          </button>
        </div>
      </div>
    </div>
  )
}
