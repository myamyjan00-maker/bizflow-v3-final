import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { fmt, COST_CATEGORIES } from '../lib/constants'
import { Modal, Field, Inp, Sel } from '../components/UI'

// 所有费用都在 case_costs 这一张表：案件页、费用页、Dashboard、报表读的是同一份数据
const EXTRA_CATS = [
  { key: 'lease', label: '租约', icon: '🏠' },
  { key: 'license', label: '营业执照', icon: '📄' },
  { key: 'transport', label: '交通', icon: '🚗' },
]
const CATS = [...COST_CATEGORIES, ...EXTRA_CATS.filter(e => !COST_CATEGORIES.some(c => c.key === e.key))]
const catLabel = k => { const c = CATS.find(x => x.key === k); return c ? `${c.icon} ${c.label}` : k }
const BANK_OPTIONS = ['RHB', 'Affin', 'Hong Leong', 'CIMB', 'BSN', 'Bank Muamalat', 'Maybank', 'AmBank', 'OCBC', 'Public Bank', 'Bank Islam']
const CLAIM_TYPES = {
  none: '不需要 Claim',
  customer: '向客户 Claim（客户要还我）',
  payer: '要还给垫付的人（我要还别人）',
}
const STATUS = {
  none: { label: '不需要 Claim', cls: 'bg-slate-100 text-slate-500' },
  pending: { label: 'Pending Claim', cls: 'bg-red-50 text-red-600' },
  claimed: { label: 'Claimed', cls: 'bg-amber-50 text-amber-700' },
  partial: { label: 'Partially Received', cls: 'bg-blue-50 text-blue-700' },
  full: { label: 'Fully Received', cls: 'bg-emerald-50 text-emerald-700' },
}
const money = n => Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const isMe = p => !p || p === '我自己' || p === '公司'

export default function Expenses({ currentUser, toast }) {
  const [costs, setCosts] = useState([])
  const [claims, setClaims] = useState([])
  const [cases, setCases] = useState([])
  const [ssms, setSsms] = useState([])
  const [owners, setOwners] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('ledger')
  const [modal, setModal] = useState(null)       // { cost } 新增/编辑费用
  const [claimModal, setClaimModal] = useState(null) // cost id
  const [search, setSearch] = useState('')
  const [fCat, setFCat] = useState('全部')
  const [fMonth, setFMonth] = useState('全部')
  const [fPayer, setFPayer] = useState('全部')
  const [fBank, setFBank] = useState('全部')
  const [fStatus, setFStatus] = useState('open') // claims tab: open | all | full
  const canEdit = ['super_admin', 'admin'].includes(currentUser.role)

  useEffect(() => { load() }, [])
  const load = async () => {
    setLoading(true)
    const [{ data: c }, { data: cl }, { data: cs }, { data: s }, { data: o }, { data: a }] = await Promise.all([
      supabase.from('case_costs').select('*').order('created_at', { ascending: false }),
      supabase.from('cost_claim_payments').select('*').order('paid_date', { ascending: true }),
      supabase.from('cases').select('id, case_no, ssm_id, owner_id'),
      supabase.from('ssm').select('id, ssm_name'),
      supabase.from('owners').select('id, name'),
      supabase.from('users').select('id, display_name').eq('role', 'agent').eq('status', 'active'),
    ])
    setCosts(c || []); setClaims(cl || []); setCases(cs || []); setSsms(s || []); setOwners(o || []); setAgents(a || [])
    setLoading(false)
  }

  const rows = useMemo(() => {
    const ssmMap = Object.fromEntries(ssms.map(s => [s.id, s.ssm_name]))
    const ownerMap = Object.fromEntries(owners.map(o => [o.id, o.name]))
    const caseMap = Object.fromEntries(cases.map(c => [c.id, c]))
    const recv = {}
    claims.forEach(p => { recv[p.cost_id] = (recv[p.cost_id] || 0) + Number(p.amount || 0) })
    return costs.map(c => {
      const cs = caseMap[c.case_id]
      const type = c.claim_type || 'none'
      const claimAmt = type === 'none' ? 0 : Number(c.claim_amount ?? c.amount ?? 0)
      const received = recv[c.id] || 0
      const outstanding = Math.max(0, claimAmt - received)
      let status = 'none'
      if (type !== 'none') {
        if (received >= claimAmt && claimAmt > 0) status = 'full'
        else if (received > 0) status = 'partial'
        else if (c.claim_date) status = 'claimed'
        else status = 'pending'
      }
      const date = c.cost_date || (c.created_at || '').slice(0, 10)
      const claimDays = c.claim_date && outstanding > 0 ? Math.floor((Date.now() - new Date(c.claim_date).getTime()) / 86400000) : null
      return {
        ...c, type, claimAmt, received, outstanding, status, date, claimDays,
        company: ssmMap[cs?.ssm_id] || '（未命名公司）', owner: ownerMap[cs?.owner_id] || '', case_no: cs?.case_no || '',
        payer: c.paid_by || '我自己',
      }
    })
  }, [costs, claims, cases, ssms, owners])

  const months = [...new Set(rows.map(r => r.date.slice(0, 7)).filter(Boolean))].sort().reverse()
  const payers = [...new Set(rows.map(r => r.payer))].sort()

  const filtered = rows.filter(r => {
    if (search) {
      const q = search.toLowerCase()
      if (!(r.company.toLowerCase().includes(q) || r.owner.toLowerCase().includes(q) || r.case_no.toLowerCase().includes(q) || (r.note || '').toLowerCase().includes(q))) return false
    }
    if (fCat !== '全部' && r.category !== fCat) return false
    if (fMonth !== '全部' && r.date.slice(0, 7) !== fMonth) return false
    if (fPayer !== '全部' && r.payer !== fPayer) return false
    if (fBank !== '全部' && r.bank_name !== fBank) return false
    return true
  })

  // ── 汇总 ──
  const sum = (arr, f) => arr.reduce((s, r) => s + f(r), 0)
  const cust = rows.filter(r => r.type === 'customer')
  const pay = rows.filter(r => r.type === 'payer')
  const S = {
    total: sum(rows, r => Number(r.amount) || 0),
    byMe: sum(rows.filter(r => isMe(r.paid_by)), r => Number(r.amount) || 0),
    byOthers: sum(rows.filter(r => !isMe(r.paid_by)), r => Number(r.amount) || 0),
    pendingClaim: sum(cust.filter(r => r.status === 'pending'), r => r.claimAmt),
    claimedWaiting: sum(cust.filter(r => r.status === 'claimed' || r.status === 'partial'), r => r.outstanding),
    receivedBack: sum(cust, r => r.received),
    outstandingClaim: sum(cust, r => r.outstanding),
    reimbPaid: sum(pay, r => r.received),
    reimbOutstanding: sum(pay, r => r.outstanding),
  }
  const filteredTotal = sum(filtered, r => Number(r.amount) || 0)

  const claimRows = rows.filter(r => r.type !== 'none').filter(r => {
    if (fStatus === 'open') return r.outstanding > 0
    if (fStatus === 'full') return r.status === 'full'
    return true
  }).filter(r => {
    if (search) {
      const q = search.toLowerCase()
      if (!(r.company.toLowerCase().includes(q) || r.owner.toLowerCase().includes(q) || r.case_no.toLowerCase().includes(q))) return false
    }
    if (fPayer !== '全部' && r.payer !== fPayer) return false
    if (fCat !== '全部' && r.category !== fCat) return false
    if (fMonth !== '全部' && r.date.slice(0, 7) !== fMonth) return false
    return true
  })

  const removeCost = async (r) => {
    if (!window.confirm(`确定删除这笔费用？\n${r.company} · ${catLabel(r.category)} · RM ${money(r.amount)}\n（它的收回记录也会一起删除）`)) return
    const { error } = await supabase.from('case_costs').delete().eq('id', r.id)
    if (error) { toast('删除失败：' + error.message, 'error'); return }
    toast('已删除'); load()
  }

  const downloadCSV = () => {
    const nl = String.fromCharCode(10), q = String.fromCharCode(34)
    const head = ['日期', '公司', 'Owner', '案件', '类别', '银行', '说明', '金额', '垫付人', 'Claim类型', 'Claim金额', 'Claim状态', 'Claim日期', '已收回/已还', '未收回/未还']
    const body = filtered.map(r => [r.date, r.company, r.owner, r.case_no, (CATS.find(c => c.key === r.category)?.label || r.category), r.bank_name || '', r.note || '', Number(r.amount || 0).toFixed(2), r.payer, CLAIM_TYPES[r.type].split('（')[0], r.claimAmt.toFixed(2), STATUS[r.status].label, r.claim_date || '', r.received.toFixed(2), r.outstanding.toFixed(2)])
    const csv = [head, ...body].map(l => l.map(c => q + String(c ?? '').replace(new RegExp(q, 'g'), q + q) + q).join(',')).join(nl)
    const blob = new Blob([String.fromCharCode(0xFEFF) + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'expenses.csv'; a.click(); URL.revokeObjectURL(url)
  }

  const pill = (active) => `px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${active ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`
  const selCls = 'px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
  const StatusChip = ({ s }) => <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS[s].cls}`}>{STATUS[s].label}</span>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-black text-slate-800 dark:text-slate-100">费用 & Claim</h1>
          <p className="text-xs text-slate-500">所有案件的费用只记一次 · 谁垫付 · 有没有收回</p>
        </div>
        <div className="flex gap-2">
          {canEdit && <button onClick={() => setModal({ cost: null })} className="px-4 py-2 text-xs rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold">＋ 新增费用</button>}
          <button onClick={downloadCSV} className="px-3 py-2 text-xs rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold">📊 下载 Excel</button>
          <button onClick={load} className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200">{loading ? '⏳' : '🔄'}</button>
        </div>
      </div>

      {/* 汇总 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          ['总费用', S.total, 'bg-teal-50 border-teal-100 text-teal-700'],
          ['我自己垫付', S.byMe, 'bg-slate-50 border-slate-200 text-slate-700'],
          ['别人垫付', S.byOthers, 'bg-slate-50 border-slate-200 text-slate-700'],
          ['还没 Claim', S.pendingClaim, 'bg-red-50 border-red-100 text-red-600'],
          ['已 Claim 等收回', S.claimedWaiting, 'bg-amber-50 border-amber-100 text-amber-700'],
          ['客户已还我', S.receivedBack, 'bg-emerald-50 border-emerald-100 text-emerald-700'],
          ['客户还欠我', S.outstandingClaim, 'bg-red-50 border-red-100 text-red-600'],
          ['我已还垫付人', S.reimbPaid, 'bg-emerald-50 border-emerald-100 text-emerald-700'],
          ['我还欠垫付人', S.reimbOutstanding, 'bg-amber-50 border-amber-100 text-amber-700'],
        ].map(([label, val, cls]) => (
          <div key={label} className={`rounded-2xl border p-4 ${cls}`}>
            <p className="text-xs font-medium opacity-70">{label}</p>
            <p className="text-lg font-black mt-1">RM {money(val)}</p>
          </div>
        ))}
      </div>

      {/* Tabs + 筛选 */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 w-fit">
        {[['ledger', '📒 费用流水'], ['claims', '🧾 Claim 追踪']].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} className={`py-2 px-4 text-xs rounded-lg font-medium ${tab === id ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-800 dark:text-slate-100' : 'text-slate-500'}`}>{l}</button>
        ))}
      </div>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索 公司 / Owner / 案件号 / 说明"
          className="w-full md:w-80 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500" />
        <div className="flex gap-2 flex-wrap items-center">
          <select value={fCat} onChange={e => setFCat(e.target.value)} className={selCls}>
            <option value="全部">全部类别</option>{CATS.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
          </select>
          <select value={fMonth} onChange={e => setFMonth(e.target.value)} className={selCls}>
            <option value="全部">全部月份</option>{months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={fPayer} onChange={e => setFPayer(e.target.value)} className={selCls}>
            <option value="全部">全部垫付人</option>{payers.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {tab === 'ledger' && (
            <select value={fBank} onChange={e => setFBank(e.target.value)} className={selCls}>
              <option value="全部">全部银行</option>{BANK_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
          {tab === 'claims' && [['open', '还没收回'], ['full', '已全部收回'], ['all', '全部']].map(([v, l]) => (
            <button key={v} onClick={() => setFStatus(v)} className={pill(fStatus === v)}>{l}</button>
          ))}
        </div>
        {tab === 'ledger' && <p className="text-xs text-slate-400">{filtered.length} 笔 · 合计 <span className="font-bold text-teal-600">RM {money(filteredTotal)}</span></p>}
        {tab === 'claims' && <p className="text-xs text-slate-400">{claimRows.length} 笔 · 未收回合计 <span className="font-bold text-red-500">RM {money(sum(claimRows, r => r.outstanding))}</span></p>}
      </div>

      {/* 费用流水 */}
      {tab === 'ledger' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>{['日期', '公司 / Owner', '类别', '银行', '金额', '垫付人', 'Claim', ''].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-bold text-slate-500 whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map(r => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{fmt(r.date)}</td>
                  <td className="px-3 py-2 max-w-[220px]">
                    <p className="font-bold text-slate-800 dark:text-slate-100 truncate">{r.company}</p>
                    <p className="text-[11px] text-slate-400 truncate">{r.case_no}{r.owner ? ' · ' + r.owner : ''}{r.note ? ' · ' + r.note : ''}</p>
                  </td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{catLabel(r.category)}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{r.bank_name || '—'}</td>
                  <td className="px-3 py-2 font-bold text-red-500 whitespace-nowrap">RM {money(r.amount)}</td>
                  <td className="px-3 py-2 text-xs">{r.payer}</td>
                  <td className="px-3 py-2">
                    <StatusChip s={r.status} />
                    {r.type !== 'none' && r.outstanding > 0 && <p className="text-[10px] text-slate-400 mt-0.5">欠 RM {money(r.outstanding)}</p>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.type !== 'none' && <button onClick={() => setClaimModal(r.id)} className="px-2 py-1 text-xs rounded-lg bg-teal-50 text-teal-600 hover:bg-teal-100 mr-1">收回</button>}
                    {canEdit && <button onClick={() => setModal({ cost: r })} className="px-2 py-1 text-xs rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 mr-1">编辑</button>}
                    {canEdit && <button onClick={() => removeCost(r)} className="px-2 py-1 text-xs rounded-lg bg-red-50 text-red-500 hover:bg-red-100">删</button>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">没有费用记录</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Claim 追踪 */}
      {tab === 'claims' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>{['公司 / 案件', '费用', '垫付人', '谁要还谁', 'Claim 金额', '已收回', '未收回', '状态', ''].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-bold text-slate-500 whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {claimRows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="px-3 py-2 max-w-[200px]">
                    <p className="font-bold text-slate-800 dark:text-slate-100 truncate">{r.company}</p>
                    <p className="text-[11px] text-slate-400">{r.case_no}</p>
                  </td>
                  <td className="px-3 py-2 text-xs">{catLabel(r.category)}{r.bank_name ? ' · ' + r.bank_name : ''}<p className="text-[11px] text-slate-400">RM {money(r.amount)} · {fmt(r.date)}</p></td>
                  <td className="px-3 py-2 text-xs">{r.payer}</td>
                  <td className="px-3 py-2 text-xs">{r.type === 'customer' ? '客户 → 我' : '我 → ' + r.payer}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">RM {money(r.claimAmt)}{r.claim_date && <p className="text-[11px] text-slate-400">{fmt(r.claim_date)}{r.claimDays !== null ? ` · ${r.claimDays} 天` : ''}</p>}</td>
                  <td className="px-3 py-2 text-xs text-emerald-600 whitespace-nowrap">RM {money(r.received)}</td>
                  <td className="px-3 py-2 text-xs font-bold text-red-500 whitespace-nowrap">RM {money(r.outstanding)}</td>
                  <td className="px-3 py-2"><StatusChip s={r.status} /></td>
                  <td className="px-3 py-2"><button onClick={() => setClaimModal(r.id)} className="px-2 py-1 text-xs rounded-lg bg-teal-50 text-teal-600 hover:bg-teal-100 whitespace-nowrap">记录收回</button></td>
                </tr>
              ))}
              {claimRows.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">没有符合的 Claim</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ExpenseModal cost={modal.cost} cases={cases} ssms={ssms} owners={owners} agents={agents} payers={payers}
          currentUser={currentUser} onClose={() => setModal(null)} onSaved={() => { setModal(null); toast('已保存'); load() }} toast={toast} />
      )}
      {claimModal && (
        <ClaimModal row={rows.find(r => r.id === claimModal)} payments={claims.filter(p => p.cost_id === claimModal)}
          canEdit={canEdit} currentUser={currentUser} onClose={() => setClaimModal(null)} onChanged={load} toast={toast} />
      )}
    </div>
  )
}

function ExpenseModal({ cost, cases, ssms, owners, agents, payers, currentUser, onClose, onSaved, toast }) {
  const ssmMap = Object.fromEntries(ssms.map(s => [s.id, s.ssm_name]))
  const ownerMap = Object.fromEntries(owners.map(o => [o.id, o.name]))
  const caseOptions = cases.map(c => ({ value: c.id, label: `${ssmMap[c.ssm_id] || '（未命名公司）'} · ${c.case_no}${ownerMap[c.owner_id] ? ' · ' + ownerMap[c.owner_id] : ''}` }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const today = new Date().toISOString().slice(0, 10)
  const [f, setF] = useState({
    case_id: cost?.case_id || '', category: cost?.category || 'bank_charge', bank_name: cost?.bank_name || '',
    amount: cost?.amount ?? '', cost_date: cost?.cost_date || (cost?.created_at || '').slice(0, 10) || today,
    paid_by: cost?.paid_by || '我自己', claim_type: cost?.claim_type || 'none',
    claim_amount: cost?.claim_amount ?? '', claim_date: cost?.claim_date || '', note: cost?.note || '',
  })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const [saving, setSaving] = useState(false)
  const payerSuggest = [...new Set(['我自己', '公司', ...agents.map(a => a.display_name), ...payers])]

  const save = async () => {
    if (!f.case_id) { toast('请先选案件', 'error'); return }
    if (!(Number(f.amount) > 0)) { toast('请填金额', 'error'); return }
    setSaving(true)
    const payload = {
      case_id: f.case_id, category: f.category, bank_name: f.bank_name || null, amount: Number(f.amount),
      cost_date: f.cost_date || null, paid_by: f.paid_by || '我自己', claim_type: f.claim_type,
      claim_amount: f.claim_type === 'none' ? null : (f.claim_amount === '' ? Number(f.amount) : Number(f.claim_amount)),
      claim_date: f.claim_type === 'none' ? null : (f.claim_date || null), note: f.note || null,
    }
    let error
    if (cost) ({ error } = await supabase.from('case_costs').update(payload).eq('id', cost.id))
    else ({ error } = await supabase.from('case_costs').insert({ ...payload, payment_method: 'transfer', transfer_amount: Number(f.amount), cash_amount: 0, created_by: currentUser.id }))
    setSaving(false)
    if (error) { toast('保存失败：' + error.message, 'error'); return }
    onSaved()
  }

  return (
    <Modal title={cost ? '编辑费用' : '新增费用'} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="案件 / 公司 *" span2><Sel value={f.case_id} onChange={v => set('case_id', v)} options={caseOptions} /></Field>
        <Field label="费用类别"><Sel value={f.category} onChange={v => set('category', v)} options={CATS.map(c => ({ value: c.key, label: `${c.icon} ${c.label}` }))} /></Field>
        <Field label="相关银行（银行费用才填）"><Sel value={f.bank_name} onChange={v => set('bank_name', v)} options={BANK_OPTIONS} /></Field>
        <Field label="金额 (RM) *"><Inp type="number" value={f.amount} onChange={v => set('amount', v)} /></Field>
        <Field label="付款日期"><Inp type="date" value={f.cost_date} onChange={v => set('cost_date', v)} /></Field>
        <Field label="谁先垫付" span2>
          <input list="payer-list" value={f.paid_by} onChange={e => set('paid_by', e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          <datalist id="payer-list">{payerSuggest.map(p => <option key={p} value={p} />)}</datalist>
        </Field>
        <Field label="Claim 类型" span2>
          <Sel value={f.claim_type} onChange={v => set('claim_type', v)} options={Object.entries(CLAIM_TYPES).map(([value, label]) => ({ value, label }))} />
        </Field>
        {f.claim_type !== 'none' && <>
          <Field label="Claim 金额（不填 = 全额）"><Inp type="number" value={f.claim_amount} onChange={v => set('claim_amount', v)} placeholder={f.amount} /></Field>
          <Field label="Claim 日期（已向对方申请才填）"><Inp type="date" value={f.claim_date} onChange={v => set('claim_date', v)} /></Field>
        </>}
        <Field label="说明 / 备注" span2><Inp value={f.note} onChange={v => set('note', v)} placeholder="例如：RHB 开户 bank charge" /></Field>
      </div>
      <div className="flex gap-2 justify-end pt-4 mt-4 border-t border-slate-200">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">取消</button>
        <button onClick={save} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50">{saving ? '保存中...' : '保存'}</button>
      </div>
    </Modal>
  )
}

function ClaimModal({ row, payments, canEdit, currentUser, onClose, onChanged, toast }) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  if (!row) return null
  const verb = row.type === 'customer' ? '客户还给我' : `我还给 ${row.payer}`

  const add = async () => {
    const a = Number(amount)
    if (!(a > 0)) { toast('请填金额', 'error'); return }
    if (a > row.outstanding + 0.005 && !window.confirm(`这笔 (RM ${money(a)}) 超过未收回的 RM ${money(row.outstanding)}，确定记录吗？`)) return
    setBusy(true)
    const { error } = await supabase.from('cost_claim_payments').insert({ cost_id: row.id, amount: a, paid_date: date || null, note: note || null, created_by: currentUser.id })
    setBusy(false)
    if (error) { toast('保存失败：' + error.message, 'error'); return }
    setAmount(''); setNote(''); toast('已记录'); onChanged()
  }
  const del = async (p) => {
    if (!window.confirm(`删除这笔收回记录 RM ${money(p.amount)}？`)) return
    const { error } = await supabase.from('cost_claim_payments').delete().eq('id', p.id)
    if (error) { toast('删除失败：' + error.message, 'error'); return }
    toast('已删除'); onChanged()
  }
  const markClaimed = async () => {
    const { error } = await supabase.from('case_costs').update({ claim_date: new Date().toISOString().slice(0, 10) }).eq('id', row.id)
    if (error) { toast('保存失败：' + error.message, 'error'); return }
    toast('已标记为 Claimed'); onChanged()
  }

  return (
    <Modal title="Claim 收回记录" onClose={onClose}>
      <div className="space-y-3">
        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-3 text-sm">
          <p className="font-bold text-slate-800 dark:text-slate-100">{row.company}</p>
          <p className="text-xs text-slate-500 mt-0.5">{catLabel(row.category)}{row.bank_name ? ' · ' + row.bank_name : ''} · 原费用 RM {money(row.amount)}（不会因为收回而减少）</p>
          <div className="grid grid-cols-3 gap-2 mt-2 text-center">
            <div><p className="text-[11px] text-slate-400">Claim 金额</p><p className="font-bold">RM {money(row.claimAmt)}</p></div>
            <div><p className="text-[11px] text-slate-400">已收回</p><p className="font-bold text-emerald-600">RM {money(row.received)}</p></div>
            <div><p className="text-[11px] text-slate-400">还欠</p><p className="font-bold text-red-500">RM {money(row.outstanding)}</p></div>
          </div>
          <p className="text-xs text-slate-500 mt-2">状态：<span className="font-medium">{STATUS[row.status].label}</span>{row.claim_date ? ` · Claim 日期 ${fmt(row.claim_date)}` : ''}</p>
        </div>

        {canEdit && row.status === 'pending' && (
          <button onClick={markClaimed} className="w-full py-2 text-xs rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 font-medium">标记为「已向对方 Claim」（今天）</button>
        )}

        <div>
          <p className="text-xs font-bold text-slate-600 mb-1">已记录的收回（{verb}）</p>
          {payments.length === 0 && <p className="text-xs text-slate-400">还没有</p>}
          {payments.map(p => (
            <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-slate-100 text-sm">
              <span className="text-xs text-slate-500">{fmt(p.paid_date)}{p.note ? ' · ' + p.note : ''}</span>
              <span className="flex items-center gap-2">
                <span className="font-bold text-emerald-600">RM {money(p.amount)}</span>
                {canEdit && <button onClick={() => del(p)} className="text-xs text-red-400 hover:text-red-600">删</button>}
              </span>
            </div>
          ))}
        </div>

        {canEdit && (
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
            <Field label={`这次${verb} (RM)`}><Inp type="number" value={amount} onChange={setAmount} placeholder={String(row.outstanding || '')} /></Field>
            <Field label="日期"><Inp type="date" value={date} onChange={setDate} /></Field>
            <Field label="备注" span2><Inp value={note} onChange={setNote} /></Field>
            <div className="col-span-2 flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">关闭</button>
              <button onClick={add} disabled={busy} className="px-5 py-2 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50">记录收回</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
