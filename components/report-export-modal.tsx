'use client'

import { useState } from 'react'
import { X, Copy, Download, Printer, Check, Sparkles, Loader2 } from 'lucide-react'

export interface MonthlyReportData {
  monthLabel: string
  incomeBase: number
  monthlySpendingTotal: number
  monthlyFixedTotal: number
  monthlyVariableTotal: number
  monthlyInvestmentTotal: number
  monthlySavingsLiquid: number
  monthlySavingsTotal: number
  prevMonthLabel: string
  prevMonthSpendingTotal: number
  prevMonthFixedTotal: number
  prevMonthVariableTotal: number
  prevMonthInvestmentTotal: number
  prevMonthlySavingsLiquid: number
  prevIncomeBase: number
  categoryBreakdown: string
  prevCategoryBreakdown: string
  yearlyData: string
  // Per-month chart data for the year
  yearlyChartData: Array<{
    month: string
    spending: number
    investment: number
    savings: number
    incomeBase: number
  }>
}

interface AIInsights {
  headline: string
  savingsAssessment: 'excelente' | 'bien' | 'mejorable' | 'critico'
  highlights: string[]
  warnings: string[]
  recommendations: string[]
  yearTrend: string
}

const assessmentColor = {
  excelente: '#16a34a',
  bien: '#2563eb',
  mejorable: '#d97706',
  critico: '#dc2626',
}

const assessmentLabel = {
  excelente: 'Excelente',
  bien: 'Bien',
  mejorable: 'Mejorable',
  critico: 'Atención',
}

function eur(n: number) {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€`
}

function buildHtmlReport(
  title: string,
  text: string,
  data: MonthlyReportData | undefined,
  aiInsights: AIInsights | null
): string {
  const now = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })

  // Yearly bar chart SVG
  let yearChartHtml = ''
  if (data && data.yearlyChartData.length > 0) {
    const maxVal = Math.max(...data.yearlyChartData.map(d => d.incomeBase || d.spending + d.savings))
    const barW = Math.floor(480 / data.yearlyChartData.length) - 4
    const chartH = 100
    const bars = data.yearlyChartData.map((d, i) => {
      const x = i * (barW + 4) + 2
      const spendH = maxVal > 0 ? Math.round((d.spending / maxVal) * chartH) : 0
      const invH = maxVal > 0 ? Math.round((d.investment / maxVal) * chartH) : 0
      const savH = maxVal > 0 ? Math.round((d.savings / maxVal) * chartH) : 0
      const totalH = spendH + invH + Math.max(0, savH)
      const yBase = chartH
      return `
        <g>
          <rect x="${x}" y="${yBase - spendH}" width="${barW}" height="${spendH}" fill="#f59e0b" opacity="0.85"/>
          ${invH > 0 ? `<rect x="${x}" y="${yBase - spendH - invH}" width="${barW}" height="${invH}" fill="#60a5fa" opacity="0.85"/>` : ''}
          ${savH > 0 ? `<rect x="${x}" y="${yBase - spendH - invH - savH}" width="${barW}" height="${savH}" fill="#22c55e" opacity="0.7"/>` : ''}
          <text x="${x + barW / 2}" y="${yBase + 12}" text-anchor="middle" font-size="9" fill="#666">${d.month}</text>
        </g>`
    }).join('')

    yearChartHtml = `
      <div style="margin-bottom:24px">
        <h2 style="font-size:14px;font-weight:700;color:#111;margin-bottom:8px">Tendencia anual</h2>
        <div style="display:flex;gap:12px;margin-bottom:8px;font-size:11px;color:#555">
          <span><span style="display:inline-block;width:12px;height:12px;background:#f59e0b;border-radius:2px;margin-right:4px"></span>Gastos</span>
          <span><span style="display:inline-block;width:12px;height:12px;background:#60a5fa;border-radius:2px;margin-right:4px"></span>Inversión</span>
          <span><span style="display:inline-block;width:12px;height:12px;background:#22c55e;border-radius:2px;margin-right:4px"></span>Ahorro líquido</span>
        </div>
        <svg width="100%" viewBox="0 0 ${data.yearlyChartData.length * (barW + 4) + 4} ${chartH + 20}" style="overflow:visible">
          ${bars}
        </svg>
      </div>`
  }

  // AI insights section
  let aiHtml = ''
  if (aiInsights) {
    const color = assessmentColor[aiInsights.savingsAssessment]
    const label = assessmentLabel[aiInsights.savingsAssessment]
    aiHtml = `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin-bottom:24px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="font-size:16px">✨</span>
          <h2 style="font-size:14px;font-weight:700;color:#111;margin:0">Análisis IA</h2>
          <span style="background:${color};color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;margin-left:auto">${label}</span>
        </div>
        <p style="font-size:14px;font-weight:600;color:#111;margin-bottom:12px">${aiInsights.headline}</p>
        ${aiInsights.highlights.length > 0 ? `
        <div style="margin-bottom:10px">
          <p style="font-size:11px;font-weight:700;color:#16a34a;margin-bottom:4px">PUNTOS POSITIVOS</p>
          ${aiInsights.highlights.map(h => `<p style="font-size:12px;color:#166534;margin:2px 0">✓ ${h}</p>`).join('')}
        </div>` : ''}
        ${aiInsights.warnings.length > 0 ? `
        <div style="margin-bottom:10px">
          <p style="font-size:11px;font-weight:700;color:#d97706;margin-bottom:4px">ALERTAS</p>
          ${aiInsights.warnings.map(w => `<p style="font-size:12px;color:#92400e;margin:2px 0">⚠ ${w}</p>`).join('')}
        </div>` : ''}
        ${aiInsights.recommendations.length > 0 ? `
        <div style="margin-bottom:10px">
          <p style="font-size:11px;font-weight:700;color:#2563eb;margin-bottom:4px">RECOMENDACIONES</p>
          ${aiInsights.recommendations.map(r => `<p style="font-size:12px;color:#1e3a8a;margin:2px 0">→ ${r}</p>`).join('')}
        </div>` : ''}
        <p style="font-size:11px;color:#555;font-style:italic;margin-top:8px;margin-bottom:0">${aiInsights.yearTrend}</p>
      </div>`
  }

  // Summary table
  let summaryHtml = ''
  if (data) {
    const savingsColor = data.monthlySavingsLiquid >= 0 ? '#16a34a' : '#dc2626'
    const prevSavingsColor = data.prevMonthlySavingsLiquid >= 0 ? '#16a34a' : '#dc2626'
    const spendDiff = data.prevMonthSpendingTotal > 0
      ? Math.round(((data.monthlySpendingTotal - data.prevMonthSpendingTotal) / data.prevMonthSpendingTotal) * 100)
      : 0
    const savDiff = data.prevIncomeBase > 0 && data.incomeBase > 0
      ? Math.round(((data.monthlySavingsLiquid / data.incomeBase) - (data.prevMonthlySavingsLiquid / data.prevIncomeBase)) * 100)
      : 0

    summaryHtml = `
      <div style="margin-bottom:24px">
        <h2 style="font-size:14px;font-weight:700;color:#111;margin-bottom:10px">Resumen del mes</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#f3f4f6">
              <th style="padding:8px 10px;text-align:left;color:#555;font-weight:600;border-radius:6px 0 0 0">Concepto</th>
              <th style="padding:8px 10px;text-align:right;color:#555;font-weight:600">${data.monthLabel}</th>
              <th style="padding:8px 10px;text-align:right;color:#555;font-weight:600;border-radius:0 6px 0 0">${data.prevMonthLabel}</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:7px 10px;color:#111">Ingresos base</td>
              <td style="padding:7px 10px;text-align:right;font-weight:600;color:#16a34a">${eur(data.incomeBase)}</td>
              <td style="padding:7px 10px;text-align:right;color:#666">${eur(data.prevIncomeBase)}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:7px 10px;color:#111">Gastos fijos</td>
              <td style="padding:7px 10px;text-align:right;font-weight:600;color:#8b5cf6">${eur(data.monthlyFixedTotal)}</td>
              <td style="padding:7px 10px;text-align:right;color:#666">${eur(data.prevMonthFixedTotal)}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:7px 10px;color:#111">Gastos variables</td>
              <td style="padding:7px 10px;text-align:right;font-weight:600;color:#f59e0b">${eur(data.monthlyVariableTotal)}</td>
              <td style="padding:7px 10px;text-align:right;color:#666">${eur(data.prevMonthVariableTotal)}</td>
            </tr>
            ${(data.monthlyInvestmentTotal > 0 || data.prevMonthInvestmentTotal > 0) ? `
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:7px 10px;color:#111">Inversión</td>
              <td style="padding:7px 10px;text-align:right;font-weight:600;color:#2563eb">${eur(data.monthlyInvestmentTotal)}</td>
              <td style="padding:7px 10px;text-align:right;color:#666">${eur(data.prevMonthInvestmentTotal)}</td>
            </tr>` : ''}
            <tr style="background:#f9fafb">
              <td style="padding:7px 10px;color:#111;font-weight:700">Ahorro líquido</td>
              <td style="padding:7px 10px;text-align:right;font-weight:700;color:${savingsColor}">${eur(data.monthlySavingsLiquid)}</td>
              <td style="padding:7px 10px;text-align:right;color:${prevSavingsColor}">${eur(data.prevMonthlySavingsLiquid)}</td>
            </tr>
            <tr>
              <td style="padding:7px 10px;color:#555;font-size:11px">Cambio en gastos reales</td>
              <td style="padding:7px 10px;text-align:right;font-size:11px;color:${spendDiff > 0 ? '#dc2626' : '#16a34a'}" colspan="2">
                ${spendDiff > 0 ? '+' : ''}${spendDiff}% vs mes anterior
              </td>
            </tr>
          </tbody>
        </table>
      </div>`
  }

  // Category comparison table
  let catHtml = ''
  if (data && data.categoryBreakdown) {
    catHtml = `
      <div style="margin-bottom:24px">
        <h2 style="font-size:14px;font-weight:700;color:#111;margin-bottom:10px">Gastos por categoría</h2>
        <pre style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;font-size:11px;color:#374151;white-space:pre-wrap;font-family:monospace">${data.categoryBreakdown}</pre>
      </div>`
  }

  // Full markdown as fallback
  const markdownHtml = `
    <div style="margin-bottom:24px">
      <h2 style="font-size:14px;font-weight:700;color:#111;margin-bottom:10px">Detalle completo de movimientos</h2>
      <pre style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;font-size:11px;color:#374151;white-space:pre-wrap;font-family:monospace">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
    </div>`

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; color: #111; background: #fff; }
    .page { max-width: 700px; margin: 0 auto; padding: 32px 24px; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { padding: 16px; }
    }
  </style>
</head>
<body>
<div class="page">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #e5e7eb">
    <div>
      <h1 style="font-size:22px;font-weight:800;color:#111;margin-bottom:4px">${title}</h1>
      <p style="font-size:12px;color:#888">Generado por Summer Quest · ${now}</p>
    </div>
    <div style="background:#111;color:#fff;padding:6px 14px;border-radius:999px;font-size:11px;font-weight:700">Summer Quest</div>
  </div>

  ${aiHtml}
  ${summaryHtml}
  ${yearChartHtml}
  ${catHtml}
  ${markdownHtml}
</div>
</body>
</html>`
}

export function ReportExportModal({
  title,
  filename,
  text,
  reportData,
  onClose,
}: {
  title: string
  filename: string
  text: string
  reportData?: MonthlyReportData
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [loadingAI, setLoadingAI] = useState(false)
  const [aiInsights, setAiInsights] = useState<AIInsights | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)

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

  const generateAIInsights = async () => {
    if (!reportData) return
    setLoadingAI(true)
    setAiError(null)
    try {
      const res = await fetch('/api/finance-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportData),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setAiInsights(data)
    } catch {
      setAiError('No se pudieron generar los insights. Inténtalo de nuevo.')
    } finally {
      setLoadingAI(false)
    }
  }

  const printPdf = () => {
    const html = buildHtmlReport(title, text, reportData, aiInsights)
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 500)
  }

  const assessBadge = aiInsights ? (
    <span
      style={{ backgroundColor: assessmentColor[aiInsights.savingsAssessment] }}
      className="text-white text-[10px] font-bold px-2 py-0.5 rounded-full"
    >
      {assessmentLabel[aiInsights.savingsAssessment]}
    </span>
  ) : null

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-background w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-secondary">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* AI Insights section */}
        {reportData && (
          <div className="mb-3">
            {!aiInsights && !loadingAI && (
              <button
                onClick={generateAIInsights}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-blue-500 text-white text-sm font-medium"
              >
                <Sparkles className="w-4 h-4" />
                Generar análisis IA
              </button>
            )}
            {loadingAI && (
              <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Analizando tus finanzas con Gemini...
              </div>
            )}
            {aiError && (
              <p className="text-xs text-red-500 text-center py-2">{aiError}</p>
            )}
            {aiInsights && (
              <div className="bg-accent rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground flex-1">Análisis IA</span>
                  {assessBadge}
                </div>
                <p className="text-sm font-medium text-foreground">{aiInsights.headline}</p>
                {aiInsights.highlights.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-green-600 uppercase tracking-wide mb-1">Positivo</p>
                    {aiInsights.highlights.map((h, i) => (
                      <p key={i} className="text-xs text-foreground">✓ {h}</p>
                    ))}
                  </div>
                )}
                {aiInsights.warnings.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide mb-1">Alertas</p>
                    {aiInsights.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-foreground">⚠ {w}</p>
                    ))}
                  </div>
                )}
                {aiInsights.recommendations.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide mb-1">Para el próximo mes</p>
                    {aiInsights.recommendations.map((r, i) => (
                      <p key={i} className="text-xs text-foreground">→ {r}</p>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground italic">{aiInsights.yearTrend}</p>
              </div>
            )}
          </div>
        )}

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
