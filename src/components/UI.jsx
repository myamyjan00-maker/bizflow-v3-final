import { useState, useCallback } from 'react'
import { CASE_STATUS_COLORS, BANK_STATUS_COLORS, TERMINATION_TYPES } from '../lib/constants'

// ── Toast ────────────────────────────────────────────────────────────────────
export function useToast() {
  const [toasts, setToasts] = useState([])
  const toast = useCallback((msg, type = 'success') => {
    const id = Date.now()
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500)
  }, [])
  return { toasts, toast }
}

export function Toasts({ toasts }) {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium text-white pointer-events-auto ${
          t.type === 'error' ? 'bg-red-600' : t.type === 'warn' ? 'bg-amber-500' : 'bg-green-600'
        }`}>
          {t.type === 'error' ? '❌' : t.type === 'warn' ? '⚠️' : '✅'} {t.msg}
        </div>
      ))}
    </div>
  )
}

// ── Badge ────────────────────────────────────────────────────────────────────
export function CaseBadge({ status, blocked, terminationType }) {
  // 终止状态优先显示（被拒 / 撤回），盖过正常的进度状态
  if (terminationType && TERMINATION_TYPES[terminationType]) {
    const t = TERMINATION_TYPES[terminationType]
    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${t.color}`}>{t.icon} {t.label}</span>
  }
  const cls = CASE_STATUS_COLORS[status] || 'bg-slate-100 text-slate-600'
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{status}</span>
      {blocked && <span title="案件卡住" className="text-xs">🟡</span>}
    </span>
  )
}

export function BankBadge({ status }) {
  const cls = BANK_STATUS_COLORS[status] || 'bg-slate-100 text-slate-600'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{status}</span>
}

// ── Modal ────────────────────────────────────────────────────────────────────
export function Modal({ title, onClose, children, wide, fullscreen }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full flex flex-col ${
        fullscreen ? 'max-w-6xl max-h-[95vh]' : wide ? 'max-w-4xl max-h-[90vh]' : 'max-w-lg max-h-[90vh]'
      }`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4">{children}</div>
      </div>
    </div>
  )
}

// ── Form helpers ─────────────────────────────────────────────────────────────
export function Field({ label, children, span2, span1 }) {
  return (
    <div className={span2 ? 'col-span-2' : 'col-span-1'}>
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  )
}

export function Inp({ value, onChange, placeholder, type = 'text', disabled, className = '' }) {
  return (
    <input type={type} value={value || ''} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} disabled={disabled}
      className={`w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50 ${className}`} />
  )
}

export function Sel({ value, onChange, options, disabled }) {
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)} disabled={disabled}
      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50">
      <option value="">-- 请选择 --</option>
      {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
    </select>
  )
}

export function Textarea({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea value={value || ''} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} rows={rows}
      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
  )
}

// ── Secret field ─────────────────────────────────────────────────────────────
export function Secret({ value }) {
  const [show, setShow] = useState(false)
  if (!value) return <span className="text-slate-400">—</span>
  return (
    <span className="flex items-center gap-1">
      <span className="font-mono text-sm">{show ? value : '••••••••'}</span>
      <button onClick={() => setShow(s => !s)} className="text-slate-400 hover:text-teal-500 text-xs">{show ? '🙈' : '👁'}</button>
    </span>
  )
}

// ── Info row ─────────────────────────────────────────────────────────────────
export function InfoRow({ label, value, secret }) {
  const [show, setShow] = useState(false)
  if (!value && value !== 0) return null
  return (
    <div className="flex items-start justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0 gap-2">
      <span className="text-xs text-slate-400 flex-shrink-0 w-28">{label}</span>
      <span className="text-xs text-right flex-1 break-all text-slate-700 dark:text-slate-300">
        {secret ? (show ? value : <span className="font-mono text-slate-400">••••••••</span>) : value}
        {secret && <button onClick={() => setShow(s => !s)} className="ml-1 text-slate-300 hover:text-teal-500">{show ? '🙈' : '👁'}</button>}
      </span>
    </div>
  )
}

// ── Pagination ────────────────────────────────────────────────────────────────
export function Pagination({ page, totalPages, onChange, totalItems, pageSize }) {
  if (totalPages <= 1) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalItems)
  const pages = []
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)) pages.push(p)
    else if (pages[pages.length - 1] !== '...') pages.push('...')
  }
  return (
    <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
      <p className="text-xs text-slate-500">显示第 {from}–{to} 笔，共 {totalItems} 笔</p>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}
          className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40">←</button>
        {pages.map((p, i) => p === '...' ? (
          <span key={'d' + i} className="px-2 text-xs text-slate-400">…</span>
        ) : (
          <button key={p} onClick={() => onChange(p)}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium ${p === page ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{p}</button>
        ))}
        <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}
          className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40">→</button>
      </div>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
export function StatCard({ icon, label, value, sub, color, onClick }) {
  return (
    <div onClick={onClick} className={`rounded-2xl p-4 border ${color} ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}>
      <p className="text-2xl mb-1">{icon}</p>
      <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}
