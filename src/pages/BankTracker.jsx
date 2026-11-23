import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// 追踪的 8 家银行（名称要跟「银行户口」里选的 bank_name 一致）
const TRACKED = ['RHB', 'Affin', 'Hong Leong', 'CIMB', 'BSN', 'Bank Muamalat', 'Maybank', 'AmBank']
const SHORT = { RHB: 'RHB', Affin: 'AFFIN', 'Hong Leong': 'HLB', CIMB: 'CIMB', BSN: 'BSN', 'Bank Muamalat': 'MUAMALAT', Maybank: 'MAYBANK', AmBank: 'AMBANK' }

// 一家银行在一个案件里的状态：done 已开户 / doing 进行中 / bad 失败 / none 还没开始
const rank = { done: 3, doing: 2, bad: 1, none: 0 }
const cellState = (rows) => {
  let best = 'none'
  rows.forEach(b => {
    const st = b.status === 'Completed' ? 'done' : b.status === 'Blacklist' ? 'bad' : 'doing'
    if (rank[st] > rank[best]) best = st
  })
  return best
}
const CELL = {
  done:  { icon: '✅', cls: 'bg-emerald-50 text-emerald-700', label: '已开户' },
  doing: { icon: '🟡', cls: 'bg-amber-50 text-amber-700', label: '进行中' },
  bad:   { icon: '⛔', cls: 'bg-red-50 text-red-600', label: '失败' },
  none:  { icon: '·', cls: 'text-slate-300', label: '未开始' },
}

export default function BankTracker({ currentUser, onNavigate }) {
  const [cases, setCases] = useState([])
  const [banks, setBanks] = useState([])
  const [ssms, setSsms] = useState([])
  const [owners, setOwners] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [agentFilter, setAgentFilter] = useState('全部')
  const [bankFilter, setBankFilter] = useState('全部')
  const [view, setView] = useState('all') // all | missing | complete | zero
  const [hideTerminated, setHideTerminated] = useState(true)

  useEffect(() => { load() }, [])
  const load = async () => {
    setLoading(true)
    const [{ data: c }, { data: b }, { data: s }, { data: o }, { data: a }] = await Promise.all([
      supabase.from('cases').select('id, case_no, ssm_id, owner_id, agent_id, status, termination_type').order('created_at', { ascending: false }),
      supabase.from('bank_accounts').select('id, ssm_id, bank_name, status'),
      supabase.from('ssm').select('id, ssm_name'),
      supabase.from('owners').select('id, name'),
      supabase.from('users').select('id, display_name').eq('role', 'agent').eq('status', 'active'),
    ])
    setCases(c || []); setBanks(b || []); setSsms(s || []); setOwners(o || []); setAgents(a || [])
    setLoading(false)
  }

  // 其他银行（OCBC、Public Bank…）也要看得到，自动加在 8 家后面
  const extraBanks = useMemo(() => [...new Set(banks.map(b => b.bank_name).filter(n => n && !TRACKED.includes(n)))].sort(), [banks])
  const columns = [...TRACKED, ...extraBanks]

  const rows = useMemo(() => {
    const ssmMap = Object.fromEntries(ssms.map(s => [s.id, s.ssm_name]))
    const ownerMap = Object.fromEntries(owners.map(o => [o.id, o.name]))
    const agentMap = Object.fromEntries(agents.map(a => [a.id, a.display_name]))
    const bySsm = {}
    banks.forEach(b => { (bySsm[b.ssm_id] = bySsm[b.ssm_id] || []).push(b) })
    return cases.map(c => {
      const own = c.ssm_id ? (bySsm[c.ssm_id] || []) : []
      const cells = {}
      columns.forEach(name => { cells[name] = cellState(own.filter(b => b.bank_name === name)) })
      const doneOf8 = TRACKED.filter(n => cells[n] === 'done').length
      const totalDone = columns.filter(n => cells[n] === 'done').length
      return {
        id: c.id, case_no: c.case_no, terminated: !!c.termination_type,
        company: ssmMap[c.ssm_id] || '（未命名）', owner: ownerMap[c.owner_id] || '', agent: agentMap[c.agent_id] || '',
        cells, doneOf8, totalDone,
      }
    })
  }, [cases, banks, ssms, owners, agents, extraBanks.join('|')])

  const visible = rows.filter(r => {
    if (hideTerminated && r.terminated) return false
    if (agentFilter !== '全部' && r.agent !== agentFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!(r.company.toLowerCase().includes(q) || r.owner.toLowerCase().includes(q) || (r.case_no || '').toLowerCase().includes(q))) return false
    }
    if (bankFilter !== '全部' && view === 'missing' && r.cells[bankFilter] === 'done') return false
    if (bankFilter !== '全部' && view === 'complete' && r.cells[bankFilter] !== 'done') return false
    if (bankFilter === '全部' && view === 'missing' && r.doneOf8 === 8) return false
    if (bankFilter === '全部' && view === 'complete' && r.doneOf8 !== 8) return false
    if (view === 'zero' && r.totalDone > 0) return false
    return true
  })

  // 汇总（只统计目前筛选里「活着」的案件范围：不含已终止、按 Agent 筛选）
  const base = rows.filter(r => !(hideTerminated && r.terminated) && (agentFilter === '全部' || r.agent === agentFilter))
  const stat = {
    cases: base.length,
    full: base.filter(r => r.doneOf8 === 8).length,
    zero: base.filter(r => r.totalDone === 0).length,
    opened: base.reduce((s, r) => s + columns.filter(n => r.cells[n] === 'done').length, 0),
    doing: base.reduce((s, r) => s + columns.filter(n => r.cells[n] === 'doing').length, 0),
    bad: base.reduce((s, r) => s + columns.filter(n => r.cells[n] === 'bad').length, 0),
  }
  const perBank = columns.map(n => ({
    name: n,
    done: base.filter(r => r.cells[n] === 'done').length,
    doing: base.filter(r => r.cells[n] === 'doing').length,
    bad: base.filter(r => r.cells[n] === 'bad').length,
  }))

  const downloadCSV = () => {
    const nl = String.fromCharCode(10), q = String.fromCharCode(34)
    const head = ['案件', '公司', 'Owner', 'Agent', ...columns.map(n => SHORT[n] || n), '已开(8家)']
    const lines = [head, ...visible.map(r => [r.case_no, r.company, r.owner, r.agent, ...columns.map(n => CELL[r.cells[n]].label), r.doneOf8 + '/8'])]
    const csv = lines.map(l => l.map(c => q + String(c ?? '').replace(new RegExp(q, 'g'), q + q) + q).join(',')).join(nl)
    const blob = new Blob([String.fromCharCode(0xFEFF) + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'bank_tracker.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const pill = (active) => `px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${active ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-black text-slate-800 dark:text-slate-100">银行开户追踪</h1>
          <p className="text-xs text-slate-500">每个案件的 8 家银行：哪家开了、哪家还没开</p>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadCSV} className="px-3 py-1.5 text-xs rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold">📊 下载 Excel</button>
          <button onClick={load} className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200">{loading ? '⏳' : '🔄'}</button>
        </div>
      </div>

      {/* 汇总 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          ['案件总数', stat.cases, 'bg-teal-50 border-teal-100 text-teal-700'],
          ['8/8 全部开好', stat.full, 'bg-emerald-50 border-emerald-100 text-emerald-700'],
          ['一家都没开', stat.zero, 'bg-red-50 border-red-100 text-red-600'],
          ['已开户总数', stat.opened, 'bg-emerald-50 border-emerald-100 text-emerald-700'],
          ['进行中', stat.doing, 'bg-amber-50 border-amber-100 text-amber-700'],
          ['失败', stat.bad, 'bg-slate-50 border-slate-200 text-slate-600'],
        ].map(([label, val, cls]) => (
          <div key={label} className={`rounded-2xl border p-4 ${cls}`}>
            <p className="text-xs font-medium opacity-70">{label}</p>
            <p className="text-2xl font-black mt-1">{val}</p>
          </div>
        ))}
      </div>

      {/* 每家银行统计 */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>{['银行', '已开户', '进行中', '失败', '未开始'].map(h => <th key={h} className="px-4 py-2 text-left text-xs font-bold text-slate-500">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {perBank.map(p => (
              <tr key={p.name} className="hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer" onClick={() => { setBankFilter(p.name); setView('missing') }}>
                <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-100">{SHORT[p.name] || p.name}</td>
                <td className="px-4 py-2 text-emerald-600 font-bold">{p.done}</td>
                <td className="px-4 py-2 text-amber-600">{p.doing}</td>
                <td className="px-4 py-2 text-red-500">{p.bad}</td>
                <td className="px-4 py-2 text-slate-500">{Math.max(0, stat.cases - p.done - p.doing - p.bad)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-2 text-[11px] text-slate-400">点某一家银行，下面会列出「还没开好这家」的案件。</p>
      </div>

      {/* 筛选 */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索 公司名 / Owner / 案件号"
          className="w-full md:w-80 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500" />
        <div className="flex gap-1 flex-wrap items-center">
          <span className="text-xs text-slate-500 mr-1">显示：</span>
          {[['all', '全部'], ['missing', '还没开好'], ['complete', '已开好'], ['zero', '一家都没开']].map(([v, l]) => (
            <button key={v} onClick={() => setView(v)} className={pill(view === v)}>{l}</button>
          ))}
          <select value={bankFilter} onChange={e => setBankFilter(e.target.value)} className="ml-2 px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            {['全部', ...columns].map(n => <option key={n} value={n}>{n === '全部' ? '全部银行' : (SHORT[n] || n)}</option>)}
          </select>
          {currentUser.role !== 'agent' && (
            <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)} className="px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              {['全部', ...agents.map(a => a.display_name)].map(n => <option key={n} value={n}>{n === '全部' ? '全部 Agent' : n}</option>)}
            </select>
          )}
          <label className="ml-2 text-xs text-slate-500 flex items-center gap-1"><input type="checkbox" checked={hideTerminated} onChange={e => setHideTerminated(e.target.checked)} />隐藏已终止</label>
        </div>
        <p className="text-xs text-slate-400">找到 <span className="font-bold text-teal-600">{visible.length}</span> 个案件</p>
      </div>

      {/* 矩阵 */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-bold text-slate-500 whitespace-nowrap">公司 / Owner</th>
              {columns.map(n => <th key={n} className="px-2 py-2 text-center text-[11px] font-bold text-slate-500 whitespace-nowrap">{SHORT[n] || n}</th>)}
              <th className="px-3 py-2 text-center text-xs font-bold text-slate-500">进度</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {visible.map(r => (
              <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer" onClick={() => onNavigate('case', r.id)}>
                <td className="px-3 py-2 max-w-[220px]">
                  <p className="font-bold text-slate-800 dark:text-slate-100 truncate">{r.company}</p>
                  <p className="text-[11px] text-slate-400 truncate">{r.owner}{r.agent ? ' · ' + r.agent : ''}{r.terminated ? ' · 已终止' : ''}</p>
                </td>
                {columns.map(n => (
                  <td key={n} className="px-1 py-2 text-center">
                    <span title={CELL[r.cells[n]].label} className={`inline-block w-8 h-7 leading-7 rounded-lg text-sm ${CELL[r.cells[n]].cls}`}>{CELL[r.cells[n]].icon}</span>
                  </td>
                ))}
                <td className="px-3 py-2 text-center whitespace-nowrap">
                  <span className={`text-xs font-bold ${r.doneOf8 === 8 ? 'text-emerald-600' : r.doneOf8 === 0 ? 'text-red-500' : 'text-amber-600'}`}>{r.doneOf8} / 8</span>
                </td>
              </tr>
            ))}
            {visible.length === 0 && <tr><td colSpan={columns.length + 2} className="px-4 py-8 text-center text-slate-400">没有符合的案件</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400">✅ 已开户（状态 Completed）　🟡 进行中（New / Bank Processing / Ready）　⛔ Blacklist　· 还没有这家银行的记录。进度只算前面 8 家。</p>
    </div>
  )
}
