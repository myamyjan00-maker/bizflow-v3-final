import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { fmt, PAYMENT_METHODS } from '../lib/constants'
import { Modal, Field, Inp, Sel } from '../components/UI'
import PayerSelect from '../components/PayerSelect'

const money = n => Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const STATUS = {
  unpaid: { label: '未付', cls: 'bg-red-50 text-red-600' },
  partial: { label: '部分已付', cls: 'bg-blue-50 text-blue-700' },
  paid: { label: '已付清', cls: 'bg-emerald-50 text-emerald-700' },
}

// 佣金：每次手动填金额，记录付给谁（Agent / 我 / KLV / 其他），可以分几次付
export default function Commissions({ currentUser, toast }) {
  const [rows, setRows] = useState([])
  const [pays, setPays] = useState([])
  const [cases, setCases] = useState([])
  const [ssms, setSsms] = useState([])
  const [owners, setOwners] = useState([])
  const [banks, setBanks] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)   // { item }
  const [payModal, setPayModal] = useState(null) // commission id
  const [search, setSearch] = useState('')
  const [fPayee, setFPayee] = useState('全部')
  const [fMonth, setFMonth] = useState('全部')
  const [fStatus, setFStatus] = useState('open')
  const canEdit = ['super_admin', 'admin'].includes(currentUser.role)

  useEffect(() => { load() }, [])
  const load = async () => {
    setLoading(true)
    const [{ data: c }, { data: p }, { data: cs }, { data: s }, { data: o }, { data: bk }, { data: ag }] = await Promise.all([
      supabase.from('commissions').select('*').order('commission_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('commission_payments').select('*').order('paid_date', { ascending: true }),
      supabase.from('cases').select('id, case_no, ssm_id, owner_id, agent_id'),
      supabase.from('ssm').select('id, ssm_name'),
      supabase.from('owners').select('id, name'),
      supabase.from('bank_accounts').select('id, ssm_id, bank_name, com_id, handover_date').not('handover_date', 'is', null).order('handover_date', { ascending: false }),
      supabase.from('users').select('id, display_name'),
    ])
    setRows(c || []); setPays(p || []); setCases(cs || []); setSsms(s || []); setOwners(o || []); setBanks(bk || []); setAgents(ag || [])
    setLoading(false)
  }

  const list = useMemo(() => {
    const ssmMap = Object.fromEntries(ssms.map(s => [s.id, s.ssm_name]))
    const ownerMap = Object.fromEntries(owners.map(o => [o.id, o.name]))
    const caseMap = Object.fromEntries(cases.map(c => [c.id, c]))
    const bankMap = Object.fromEntries(banks.map(b => [b.id, b]))
    const paid = {}
    pays.forEach(p => { paid[p.commission_id] = (paid[p.commission_id] || 0) + Number(p.amount || 0) })
    return rows.map(r => {
      const cs = caseMap[r.case_id]
      const paidAmt = paid[r.id] || 0
      const outstanding = Math.max(0, Number(r.amount) - paidAmt)
      const status = paidAmt <= 0 ? 'unpaid' : outstanding > 0.005 ? 'partial' : 'paid'
      return { ...r, paidAmt, outstanding, status, com_id: bankMap[r.bank_account_id]?.com_id || '', bank_name: bankMap[r.bank_account_id]?.bank_name || '', company: cs ? (ssmMap[cs.ssm_id] || '（未命名公司）') : (bankMap[r.bank_account_id] ? (ssmMap[bankMap[r.bank_account_id].ssm_id] || '（未命名公司）') : '（没有关联案件）'), owner: cs ? (ownerMap[cs.owner_id] || '') : '', case_no: cs?.case_no || '', date: r.commission_date || (r.created_at || '').slice(0, 10) }
    })
  }, [rows, pays, cases, ssms, owners, banks])

  const payees = [...new Set(list.map(r => r.payee))].sort()
  const months = [...new Set(list.map(r => r.date.slice(0, 7)).filter(Boolean))].sort().reverse()
  const filtered = list.filter(r => {
    if (fPayee !== '全部' && r.payee !== fPayee) return false
    if (fMonth !== '全部' && r.date.slice(0, 7) !== fMonth) return false
    if (fStatus === 'open' && r.outstanding <= 0.005) return false
    if (fStatus === 'paid' && r.status !== 'paid') return false
    if (search) {
      const q = search.toLowerCase()
      if (!(r.company.toLowerCase().includes(q) || r.com_id.toLowerCase().includes(q) || r.owner.toLowerCase().includes(q) || r.case_no.toLowerCase().includes(q) || (r.note || '').toLowerCase().includes(q))) return false
    }
    return true
  })
  const groups = useMemo(() => {
    const m = {}
    filtered.forEach(r => { (m[r.payee] = m[r.payee] || []).push(r) })
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0])).map(([name, items]) => ({
      name, items,
      total: items.reduce((s, r) => s + Number(r.amount), 0),
      paid: items.reduce((s, r) => s + r.paidAmt, 0),
      outstanding: items.reduce((s, r) => s + r.outstanding, 0),
    }))
  }, [filtered])
  const T = { total: filtered.reduce((s, r) => s + Number(r.amount), 0), paid: filtered.reduce((s, r) => s + r.paidAmt, 0), out: filtered.reduce((s, r) => s + r.outstanding, 0) }

  // 已交接、有 COM ID、但还没填过任何佣金的户口
  const todo = useMemo(() => {
    const done = new Set(rows.map(r => r.bank_account_id).filter(Boolean))
    const ssmMap = Object.fromEntries(ssms.map(s => [s.id, s.ssm_name]))
    const agentMap = Object.fromEntries(agents.map(a => [a.id, a.display_name]))
    return banks.filter(b => b.com_id && !done.has(b.id)).map(b => {
      const cs = cases.find(c => c.ssm_id === b.ssm_id)
      return { ...b, company: ssmMap[b.ssm_id] || '（未命名公司）', agent: cs?.agent_id ? (agentMap[cs.agent_id] || '') : '' }
    })
  }, [banks, rows, cases, ssms, agents])

  const remove = async (r) => {
    if (!window.confirm(`确定删除这笔佣金？\n${r.payee} · ${r.company} · RM ${money(r.amount)}\n（它的付款记录也会一起删除）`)) return
    const { error } = await supabase.from('commissions').delete().eq('id', r.id)
    if (error) { toast('删除失败：' + error.message, 'error'); return }
    toast('已删除'); load()
  }

  const downloadCSV = () => {
    const nl = String.fromCharCode(10), q = String.fromCharCode(34)
    const head = ['收佣金的人', '日期', '公司', 'Owner', 'COM ID', '银行', '佣金', '已付', '还欠', '状态', '备注']
    const body = filtered.map(r => [r.payee, r.date, r.company, r.owner, r.com_id, r.bank_name, Number(r.amount).toFixed(2), r.paidAmt.toFixed(2), r.outstanding.toFixed(2), STATUS[r.status].label, r.note || ''])
    const csv = [head, ...body].map(l => l.map(c => q + String(c ?? '').replace(new RegExp(q, 'g'), q + q) + q).join(',')).join(nl)
    const blob = new Blob([String.fromCharCode(0xFEFF) + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'commissions.csv'; a.click(); URL.revokeObjectURL(url)
  }

  const pill = (active) => `px-3 py-1.5 text-xs rounded-lg font-medium ${active ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`
  const selCls = 'px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-black text-slate-800 dark:text-slate-100">佣金</h1>
          <p className="text-xs text-slate-500">付给 Agent、我、KLV 等人的佣金 · 每次手动填 · 可分几次付</p>
        </div>
        <div className="flex gap-2">
          {canEdit && <button onClick={() => setModal({ item: null })} className="px-4 py-2 text-xs rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold">＋ 新增佣金</button>}
          <button onClick={downloadCSV} className="px-3 py-2 text-xs rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold">📊 下载 Excel</button>
          <button onClick={load} className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200">{loading ? '⏳' : '🔄'}</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[['佣金总额', T.total, 'bg-teal-50 border-teal-100 text-teal-700'], ['已付', T.paid, 'bg-emerald-50 border-emerald-100 text-emerald-700'], ['还欠', T.out, 'bg-red-50 border-red-100 text-red-600']].map(([l, v, cls]) => (
          <div key={l} className={`rounded-2xl border p-4 ${cls}`}><p className="text-xs font-medium opacity-70">{l}</p><p className="text-xl font-black mt-1">RM {money(v)}</p></div>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索 公司 / Owner / 案件号 / 备注"
          className="w-full md:w-80 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500" />
        <div className="flex gap-2 flex-wrap items-center">
          {[['open', '还没付清'], ['paid', '已付清'], ['all', '全部']].map(([v, l]) => <button key={v} onClick={() => setFStatus(v)} className={pill(fStatus === v)}>{l}</button>)}
          <select value={fPayee} onChange={e => setFPayee(e.target.value)} className={selCls}><option value="全部">全部收佣金的人</option>{payees.map(p => <option key={p} value={p}>{p}</option>)}</select>
          <select value={fMonth} onChange={e => setFMonth(e.target.value)} className={selCls}><option value="全部">全部月份</option>{months.map(m => <option key={m} value={m}>{m}</option>)}</select>
        </div>
      </div>

      {canEdit && todo.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-amber-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-amber-800">⏳ 已交接、还没填佣金（{todo.length}）</h3>
            <span className="text-[11px] text-amber-700">点右边按钮直接填，COM ID 已选好</span>
          </div>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-sm"><tbody className="[&>tr>td]:border-b [&>tr>td]:border-amber-100">
              {todo.map(b => (
                <tr key={b.id}>
                  <td className="px-3 py-2 font-mono text-xs text-green-700 whitespace-nowrap">{b.com_id}</td>
                  <td className="px-3 py-2 max-w-[240px] truncate font-medium text-slate-700">{b.company}</td>
                  <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{b.bank_name} · {fmt(b.handover_date)}</td>
                  <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{b.agent ? 'Agent：' + b.agent : ''}</td>
                  <td className="px-3 py-2"><button onClick={() => setModal({ item: null, bank: b })} className="px-2 py-1 text-xs rounded-lg bg-teal-600 text-white hover:bg-teal-700 whitespace-nowrap">＋ 填佣金</button></td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </div>
      )}

      {groups.map(g => (
        <div key={g.name} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">👤 {g.name} <span className="text-xs font-normal text-slate-400">· {g.items.length} 笔</span></h3>
            <div className="text-xs flex gap-3"><span>佣金 <b>RM {money(g.total)}</b></span><span className="text-emerald-600">已付 RM {money(g.paid)}</span><span className="text-red-600">还欠 <b>RM {money(g.outstanding)}</b></span></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="[&>tr>td]:border-b [&>tr>td]:border-slate-100 dark:[&>tr>td]:border-slate-800">
                {g.items.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                    <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{fmt(r.date)}</td>
                    <td className="px-3 py-2 max-w-[240px]"><p className="font-bold text-slate-800 dark:text-slate-100 truncate">{r.company}</p><p className="text-[11px] text-slate-400 truncate">{r.com_id ? <span className="font-mono text-green-700">{r.com_id}</span> : r.case_no}{r.bank_name ? ' · ' + r.bank_name : ''}{r.owner ? ' · ' + r.owner : ''}{r.note ? ' · ' + r.note : ''}</p></td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">RM {money(r.amount)}</td>
                    <td className="px-3 py-2 text-xs text-emerald-600 whitespace-nowrap">已付 RM {money(r.paidAmt)}</td>
                    <td className="px-3 py-2 text-xs font-bold text-red-500 whitespace-nowrap">欠 RM {money(r.outstanding)}</td>
                    <td className="px-3 py-2"><span className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span></td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button onClick={() => setPayModal(r.id)} className="px-2 py-1 text-xs rounded-lg bg-teal-50 text-teal-600 hover:bg-teal-100 mr-1">付款</button>
                      {canEdit && <button onClick={() => setModal({ item: r })} className="px-2 py-1 text-xs rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 mr-1">编辑</button>}
                      {canEdit && <button onClick={() => remove(r)} className="px-2 py-1 text-xs rounded-lg bg-red-50 text-red-500 hover:bg-red-100">删</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {groups.length === 0 && <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 px-4 py-8 text-center text-slate-400 text-sm">没有佣金记录</div>}

      {modal && <CommissionModal item={modal.item} initBank={modal.bank} banks={banks} agents={agents} cases={cases} ssms={ssms} owners={owners} currentUser={currentUser} toast={toast}
        onClose={() => setModal(null)} onSaved={() => { setModal(null); toast('已保存'); load() }} />}
      {payModal && <PayModal row={list.find(r => r.id === payModal)} payments={pays.filter(p => p.commission_id === payModal)}
        canEdit={canEdit} currentUser={currentUser} toast={toast} onClose={() => setPayModal(null)} onChanged={load} />}
    </div>
  )
}

function CommissionModal({ item, initBank, banks, agents, cases, ssms, owners, currentUser, toast, onClose, onSaved }) {
  const ssmMap = Object.fromEntries(ssms.map(s => [s.id, s.ssm_name]))
  const agentMap = Object.fromEntries(agents.map(a => [a.id, a.display_name]))
  const bankOptions = banks.filter(b => b.com_id).map(b => ({ value: b.id, label: `${b.com_id} · ${ssmMap[b.ssm_id] || '（未命名公司）'} · ${b.bank_name}` }))
  const caseOf = (bank) => bank ? cases.find(c => c.ssm_id === bank.ssm_id) : null
  const initB = initBank || banks.find(b => b.id === item?.bank_account_id) || null
  const [f, setF] = useState({
    bank_account_id: initB?.id || '',
    payee: item?.payee || (caseOf(initB)?.agent_id ? agentMap[caseOf(initB).agent_id] : '') || 'KLV',
    amount: item?.amount ?? '', commission_date: item?.commission_date || new Date().toISOString().slice(0, 10), note: item?.note || '',
  })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const [busy, setBusy] = useState(false)
  const pickBank = (id) => {
    const b = banks.find(x => x.id === id)
    set('bank_account_id', id)
    const ag = caseOf(b)?.agent_id
    if (!item && ag && agentMap[ag]) set('payee', agentMap[ag]) // 新增时，收佣金的人默认带出这个案件的 Agent
  }
  const save = async () => {
    if (!f.payee) { toast('请选收佣金的人', 'error'); return }
    if (!(Number(f.amount) > 0)) { toast('请填佣金金额', 'error'); return }
    const b = banks.find(x => x.id === f.bank_account_id)
    setBusy(true)
    const payload = { bank_account_id: f.bank_account_id || null, case_id: caseOf(b)?.id || item?.case_id || null, payee: f.payee, amount: Number(f.amount), commission_date: f.commission_date || null, note: f.note || null }
    const { error } = item ? await supabase.from('commissions').update(payload).eq('id', item.id) : await supabase.from('commissions').insert({ ...payload, created_by: currentUser.id })
    setBusy(false)
    if (error) { toast('保存失败：' + error.message, 'error'); return }
    onSaved()
  }
  return (
    <Modal title={item ? '编辑佣金' : '新增佣金'} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="COM ID（直接选）" span2><Sel value={f.bank_account_id} onChange={pickBank} options={bankOptions} /></Field>
        <Field label="谁收这笔佣金 *" span2><PayerSelect value={f.payee} onChange={v => set('payee', v)} /></Field>
        <Field label="佣金金额 (RM) *"><Inp type="number" value={f.amount} onChange={v => set('amount', v)} /></Field>
        <Field label="日期"><Inp type="date" value={f.commission_date} onChange={v => set('commission_date', v)} /></Field>
        <Field label="备注" span2><Inp value={f.note} onChange={v => set('note', v)} placeholder="（可选）" /></Field>
      </div>
      <div className="flex gap-2 justify-end pt-4 mt-4 border-t border-slate-200">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">取消</button>
        <button onClick={save} disabled={busy} className="px-5 py-2 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50">{busy ? '保存中...' : '保存'}</button>
      </div>
    </Modal>
  )
}

function PayModal({ row, payments, canEdit, currentUser, toast, onClose, onChanged }) {
  const [amount, setAmount] = useState(row ? String(row.outstanding || '') : '')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState('transfer')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  if (!row) return null
  const add = async () => {
    const a = Number(amount)
    if (!(a > 0)) { toast('请填金额', 'error'); return }
    if (a > row.outstanding + 0.005 && !window.confirm(`这笔 RM ${money(a)} 超过还欠的 RM ${money(row.outstanding)}，确定吗？`)) return
    setBusy(true)
    const { error } = await supabase.from('commission_payments').insert({ commission_id: row.id, amount: a, paid_date: date || null, payment_method: method, note: note || null, created_by: currentUser.id })
    setBusy(false)
    if (error) { toast('保存失败：' + error.message, 'error'); return }
    setNote(''); setAmount(''); toast('已记录付款'); onChanged()
  }
  const del = async (p) => {
    if (!window.confirm(`删除这笔付款 RM ${money(p.amount)}？`)) return
    const { error } = await supabase.from('commission_payments').delete().eq('id', p.id)
    if (error) { toast('删除失败：' + error.message, 'error'); return }
    toast('已删除'); onChanged()
  }
  return (
    <Modal title="佣金付款记录" onClose={onClose}>
      <div className="space-y-3">
        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-3 text-sm">
          <p className="font-bold text-slate-800 dark:text-slate-100">{row.payee} · {row.company}</p>
          <div className="grid grid-cols-3 gap-2 mt-2 text-center">
            <div><p className="text-[11px] text-slate-400">佣金</p><p className="font-bold">RM {money(row.amount)}</p></div>
            <div><p className="text-[11px] text-slate-400">已付</p><p className="font-bold text-emerald-600">RM {money(row.paidAmt)}</p></div>
            <div><p className="text-[11px] text-slate-400">还欠</p><p className="font-bold text-red-500">RM {money(row.outstanding)}</p></div>
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-600 mb-1">已付记录</p>
          {payments.length === 0 && <p className="text-xs text-slate-400">还没有</p>}
          {payments.map(p => (
            <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-slate-100 text-sm">
              <span className="text-xs text-slate-500">{fmt(p.paid_date)}{p.payment_method ? ' · ' + (PAYMENT_METHODS[p.payment_method]?.label || p.payment_method) : ''}{p.note ? ' · ' + p.note : ''}</span>
              <span className="flex items-center gap-2"><span className="font-bold text-emerald-600">RM {money(p.amount)}</span>{canEdit && <button onClick={() => del(p)} className="text-xs text-red-400 hover:text-red-600">删</button>}</span>
            </div>
          ))}
        </div>
        {canEdit && (
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
            <Field label="这次付 (RM)"><Inp type="number" value={amount} onChange={setAmount} /></Field>
            <Field label="日期"><Inp type="date" value={date} onChange={setDate} /></Field>
            <Field label="付款方式"><Sel value={method} onChange={setMethod} options={Object.entries(PAYMENT_METHODS).map(([value, m]) => ({ value, label: `${m.icon} ${m.label}` }))} /></Field>
            <Field label="备注"><Inp value={note} onChange={setNote} /></Field>
            <div className="col-span-2 flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">关闭</button>
              <button onClick={add} disabled={busy} className="px-5 py-2 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50">记录付款</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
