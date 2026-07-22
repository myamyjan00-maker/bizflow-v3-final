import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { fmt, fmtMoney, PAYMENT_METHODS } from '../lib/constants'

const TABS = [
  { id: 'agent',      label: '👤 Agent 报表' },
  { id: 'pending',    label: '⏳ 未完成户口' },
  { id: 'missing',    label: '⚠️ 资料缺失' },
  { id: 'monthly',    label: '📅 月度报表' },
  { id: 'accounts',   label: '💰 账户报表' },
]

export default function Reports({ currentUser, onNavigate }) {
  const [tab, setTab] = useState('agent')
  const [cases, setCases] = useState([])
  const [banks, setBanks] = useState([])
  const [owners, setOwners] = useState([])
  const [ssms, setSSMs] = useState([])
  const [agents, setAgents] = useState([])
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [filterMode, setFilterMode] = useState('month') // month | range
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [agentFilter, setAgentFilter] = useState('全部')
  const [companyAccounts, setCompanyAccounts] = useState([])
  const [transactions, setTransactions] = useState([])
  const [selectedAccount, setSelectedAccount] = useState('全部')

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    const [{ data: c }, { data: b }, { data: o }, { data: s }, { data: a }, { data: f }, { data: ca }, { data: tx }] = await Promise.all([
      supabase.from('cases').select('*').order('created_at', { ascending: false }),
      supabase.from('bank_accounts').select('*').order('created_at', { ascending: false }),
      supabase.from('owners').select('id,name,ic,phone,email,address'),
      // 注意：这里仍需查 ezbiz_user_id / ezbiz_password 是因为「资料缺失」分析要判断有没有填。
      // 这是暂时的妥协——理想做法应该是用一个只回传布尔值的数据库视图，避免明文密码传到前端。
      // 列入技术债，之后处理敏感欄位隐藏时一并解决。
      supabase.from('ssm').select('id,ssm_name,reg_no,status,ezbiz_user_id,ezbiz_password'),
      supabase.from('users').select('id,display_name').eq('role', 'agent').eq('status', 'active'),
      supabase.from('files').select('ssm_id,category'),
      supabase.from('company_accounts').select('*').order('name'),
      supabase.from('account_transactions').select('*, company_accounts(name), cases(case_no)').order('date', { ascending: false }),
    ])
    setCases(currentUser.role === 'agent' ? (c || []).filter(x => x.agent_id === currentUser.id) : (c || []))
    setBanks(b || [])
    setOwners(o || [])
    setSSMs(s || [])
    setAgents(a || [])
    setFiles(f || [])
    setCompanyAccounts(ca || [])
    setTransactions(tx || [])
    setLoading(false)
  }

  const getOwner = id => owners.find(o => o.id === id)
  const getSSM = id => ssms.find(s => s.id === id)
  const getAgent = id => agents.find(a => a.id === id)
  const getCaseBanks = caseItem => banks.filter(b => b.ssm_id === caseItem?.ssm_id)
  const getCaseFiles = caseItem => files.filter(f => f.ssm_id === caseItem?.ssm_id)

  // ── Account Report（616 / S14 各自的报表）──────────────────────────────────
  const accountFilteredTx = useMemo(() => {
    if (selectedAccount === '全部') return transactions
    return transactions.filter(t => t.company_accounts?.name === selectedAccount)
  }, [transactions, selectedAccount])

  const accountSummary = useMemo(() => {
    const inTypes = ['deposit_return', 'adjustment_in']
    const outTypes = ['deposit_out', 'adjustment_out', 'charge']
    const totalIn = accountFilteredTx.filter(t => inTypes.includes(t.type)).reduce((s, t) => s + (Number(t.amount) || 0), 0)
    const totalOut = accountFilteredTx.filter(t => outTypes.includes(t.type)).reduce((s, t) => s + (Number(t.amount) || 0), 0)
    const transferCount = accountFilteredTx.filter(t => t.payment_method === 'transfer').length
    const cashCount = accountFilteredTx.filter(t => t.payment_method === 'cash').length
    const transferAmount = accountFilteredTx.filter(t => t.payment_method === 'transfer').reduce((s, t) => s + (Number(t.amount) || 0), 0)
    const cashAmount = accountFilteredTx.filter(t => t.payment_method === 'cash').reduce((s, t) => s + (Number(t.amount) || 0), 0)
    return { totalIn, totalOut, net: totalIn - totalOut, transferCount, cashCount, transferAmount, cashAmount }
  }, [accountFilteredTx])

  const accountMonthly = useMemo(() => {
    const inTypes = ['deposit_return', 'adjustment_in']
    const outTypes = ['deposit_out', 'adjustment_out', 'charge']
    const byMonth = {}
    accountFilteredTx.forEach(t => {
      const m = (t.date || t.created_at || '').slice(0, 7)
      if (!m) return
      if (!byMonth[m]) byMonth[m] = { in: 0, out: 0 }
      if (inTypes.includes(t.type)) byMonth[m].in += Number(t.amount) || 0
      else if (outTypes.includes(t.type)) byMonth[m].out += Number(t.amount) || 0
    })
    return Object.entries(byMonth).sort((a, b) => b[0].localeCompare(a[0])).map(([m, v]) => ({ month: m, ...v, net: v.in - v.out }))
  }, [accountFilteredTx])

  const txTypeLabels = {
    deposit_out: '💸 Deposit 出款', deposit_return: '🔄 Deposit 回款',
    adjustment_in: '📥 调整（入）', adjustment_out: '📤 调整（出）', charge: '💳 费用',
  }

  // ── Agent Report ────────────────────────────────────────────────────────────
  const agentReport = useMemo(() => {
    return agents.map(ag => {
      const agCases = cases.filter(c => c.agent_id === ag.id)
      const agBanks = banks.filter(b => {
        const cas = cases.find(c => c.ssm_id === b.ssm_id)
        return cas?.agent_id === ag.id
      })
      const completedBanks = agBanks.filter(b => b.status === 'Completed')
      // 未完成的定义：不是 Completed/Blacklist，而且案件本身还活着（没被拒绝/撤回）
      // 已终止案件的银行户口不该继续拖累 Agent 的「未完成」数字
      const pendingBanks = agBanks.filter(b => {
        const cas = cases.find(c => c.ssm_id === b.ssm_id)
        return b.status !== 'Completed' && b.status !== 'Blacklist' && !cas?.termination_type
      })
      const terminatedCases = agCases.filter(c => c.termination_type)
      const totalCommission = completedBanks.reduce((s, b) => s + (Number(b.commission) || 0), 0)
      const totalCosts = completedBanks.reduce((s, b) =>
        s + (Number(b.fee_deposit) || 0) + (Number(b.fee_bank_charge) || 0) +
        (Number(b.fee_card) || 0) + (Number(b.fee_simcard) || 0) + (Number(b.fee_forex) || 0) + (Number(b.fee_others) || 0), 0)
      const netProfit = totalCommission - totalCosts
      return { agent: ag, totalCases: agCases.length, totalBanks: agBanks.length, completedBanks: completedBanks.length, pendingBanks: pendingBanks.length, terminatedCases: terminatedCases.length, totalCommission, totalCosts, netProfit }
    }).filter(r => r.totalCases > 0)
  }, [agents, cases, banks])

  // ── Pending Banks ───────────────────────────────────────────────────────────
  const pendingBanks = useMemo(() => {
    return banks.filter(b => ['New', 'Bank Processing', 'Ready'].includes(b.status))
      .map(b => {
        const cas = cases.find(c => c.ssm_id === b.ssm_id)
        const ssm = getSSM(b.ssm_id)
        const owner = getOwner(cas?.owner_id || b.owner_id)
        const agent = getAgent(cas?.agent_id)
        const daysSince = b.updated_at ? Math.floor((Date.now() - new Date(b.updated_at).getTime()) / 86400000) : null
        return { ...b, cas, ssm, owner, agent, daysSince }
      })
      // 案件已被拒绝/撤回的，不会再有进展了，从「未完成」清单里排除，避免死案件永远占着位置
      .filter(b => !b.cas?.termination_type)
      .filter(b => agentFilter === '全部' || b.agent?.display_name === agentFilter)
      .sort((a, b) => (b.daysSince || 0) - (a.daysSince || 0))
  }, [banks, cases, ssms, owners, agents, agentFilter])

  // ── Missing Data ────────────────────────────────────────────────────────────
  const missingData = useMemo(() => {
    return cases
      // 已终止的案件不会再补资料了，排除掉，避免变成没有意义的提醒
      .filter(c => !c.termination_type)
      .filter(c => agentFilter === '全部' || getAgent(c.agent_id)?.display_name === agentFilter)
      .map(c => {
        const owner = getOwner(c.owner_id)
        const ssm = getSSM(c.ssm_id)
        const caseBanks = getCaseBanks(c)
        const caseFiles = getCaseFiles(c)
        const issues = []

        // Owner issues
        if (!owner?.phone) issues.push({ type: 'owner', field: '电话号码', severity: 'high' })
        if (!owner?.ic) issues.push({ type: 'owner', field: 'IC 号码', severity: 'high' })
        if (!owner?.mother_name) issues.push({ type: 'owner', field: '母亲姓名', severity: 'medium' })
        if (!owner?.address) issues.push({ type: 'owner', field: '地址', severity: 'low' })

        // SSM issues
        if (ssm && !ssm.reg_no) issues.push({ type: 'ssm', field: 'SSM 注册号', severity: 'high' })
        if (ssm && !ssm.ezbiz_user_id) issues.push({ type: 'ssm', field: 'EZBIZ User ID', severity: 'medium' })
        if (ssm && !ssm.ezbiz_password) issues.push({ type: 'ssm', field: 'EZBIZ 密码', severity: 'medium' })

        // Bank issues
        caseBanks.forEach(b => {
          if (!b.account_no) issues.push({ type: 'bank', field: `${b.bank_name} — 账号未填`, severity: 'high' })
          if (!b.ob_password) issues.push({ type: 'bank', field: `${b.bank_name} — OB 密码未填`, severity: 'high' })
          if (!b.atm_card_no) issues.push({ type: 'bank', field: `${b.bank_name} — ATM 卡号未填`, severity: 'medium' })
          if (!b.atm_pin) issues.push({ type: 'bank', field: `${b.bank_name} — ATM PIN 未填`, severity: 'medium' })
          if (!b.tac_phone) issues.push({ type: 'bank', field: `${b.bank_name} — TAC Phone 未填`, severity: 'low' })
        })

        // File issues
        const hasIC = caseFiles.some(f => f.category === 'IC (Owner)')
        const hasSSMDoc = caseFiles.some(f => f.category === 'SSM Document')
        if (!hasIC) issues.push({ type: 'file', field: 'IC 文件未上传', severity: 'medium' })
        if (!hasSSMDoc && ssm) issues.push({ type: 'file', field: 'SSM 文件未上传', severity: 'medium' })

        return { ...c, owner, ssm, agent: getAgent(c.agent_id), caseBanks, issues }
      })
      .filter(c => c.issues.length > 0)
      .sort((a, b) => {
        const highA = a.issues.filter(i => i.severity === 'high').length
        const highB = b.issues.filter(i => i.severity === 'high').length
        return highB - highA
      })
  }, [cases, owners, ssms, banks, files, agents, agentFilter])

  // ── Monthly Report ──────────────────────────────────────────────────────────
  const monthlyBanks = useMemo(() => {
    return banks.filter(b => {
      if (!b.handover_date) return false
      const d = new Date(b.handover_date)
      const cas = cases.find(c => c.ssm_id === b.ssm_id)
      const matchAgent = agentFilter === '全部' || getAgent(cas?.agent_id)?.display_name === agentFilter
      if (!matchAgent) return false
      if (filterMode === 'month') {
        const start = new Date(month + '-01')
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
        return d >= start && d <= end
      } else {
        const from = dateFrom ? new Date(dateFrom) : null
        const to = dateTo ? new Date(dateTo) : null
        if (from && d < from) return false
        if (to && d > to) return false
        return true
      }
    }).map(b => {
      const cas = cases.find(c => c.ssm_id === b.ssm_id)
      const ssm = getSSM(b.ssm_id)
      const owner = getOwner(cas?.owner_id || b.owner_id)
      const agent = getAgent(cas?.agent_id)
      const totalFees = (Number(b.fee_deposit) || 0) + (Number(b.fee_bank_charge) || 0) + (Number(b.fee_card) || 0) + (Number(b.fee_simcard) || 0) + (Number(b.fee_forex) || 0) + (Number(b.fee_others) || 0)
      const netCommission = (Number(b.commission) || 0) - totalFees
      return { ...b, cas, ssm, owner, agent, totalFees, netCommission }
    })
  }, [banks, cases, ssms, owners, agents, month, dateFrom, dateTo, filterMode, agentFilter])

  const downloadCSV = (rows, filename) => {
    const nl = String.fromCharCode(10)
    const q = String.fromCharCode(34)
    const csv = rows.map(r => r.map(c => q + (c || '').toString().replace(new RegExp(q, 'g'), q + q) + q).join(',')).join(nl)
    const blob = new Blob([String.fromCharCode(0xFEFF) + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  const downloadAgentReport = () => {
    downloadCSV([
      ['Agent', '总案件', '总银行户口', '已完成', '未完成', '已终止', '总收费(RM)', '总成本(RM)', '净利润(RM)'],
      ...agentReport.map(r => [r.agent.display_name, r.totalCases, r.totalBanks, r.completedBanks, r.pendingBanks, r.terminatedCases, r.totalCommission.toFixed(2), r.totalCosts.toFixed(2), r.netProfit.toFixed(2)]),
    ], 'agent_report.csv')
  }

  const downloadMonthlyReport = () => {
    downloadCSV([
      ['SSM名称', 'Owner', 'IC', '银行', '账号', '交接日期', 'COM ID', 'Agent', '收费(RM)', '总成本(RM)', '净佣金(RM)'],
      ...monthlyBanks.map(b => [b.ssm?.ssm_name || '—', b.owner?.name || '—', b.owner?.ic || '—', b.bank_name, b.account_no || '—', b.handover_date || '—', b.com_id || '—', b.agent?.display_name || '—', b.commission || 0, b.totalFees.toFixed(2), b.netCommission.toFixed(2)]),
    ], `monthly_report_${month}.csv`)
  }

  const sevColor = { high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-slate-100 text-slate-600' }
  const sevLabel = { high: '必填', medium: '建议', low: '可选' }
  const typeIcon = { owner: '👤', ssm: '🏢', bank: '🏦', file: '📁' }
  const bankStatusColor = { New: 'bg-purple-100 text-purple-700', 'Bank Processing': 'bg-amber-100 text-amber-700', Ready: 'bg-lime-100 text-lime-700' }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-black text-slate-800 dark:text-slate-100">报表中心</h1>
          <p className="text-xs text-slate-500">Agent 绩效 · 未完成追踪 · 资料缺失提醒</p>
        </div>
        <button onClick={loadData} className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200">{loading ? '⏳' : '🔄'}</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 overflow-x-auto">
        {TABS.filter(t => t.id !== 'accounts' || currentUser.role !== 'agent').map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 px-3 text-xs rounded-lg font-medium whitespace-nowrap transition-colors ${tab === t.id ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-start">
        {currentUser.role !== 'agent' && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500">Agent：</span>
            <div className="flex gap-1 flex-wrap">
              {['全部', ...agents.map(a => a.display_name)].map(name => (
                <button key={name} onClick={() => setAgentFilter(name)}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${agentFilter === name ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}>
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}
        {tab === 'monthly' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
            <div className="flex gap-2">
              <button onClick={() => setFilterMode('month')}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${filterMode === 'month' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                按月份
              </button>
              <button onClick={() => setFilterMode('range')}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${filterMode === 'range' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                日期范围
              </button>
            </div>
            {filterMode === 'month' ? (
              <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500" />
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-500">从</span>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-500">至</span>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                {(dateFrom || dateTo) && (
                  <button onClick={() => { setDateFrom(''); setDateTo('') }}
                    className="px-2 py-1.5 text-xs rounded-lg bg-red-50 text-red-500 hover:bg-red-100">
                    清除
                  </button>
                )}
              </div>
            )}
            <p className="text-xs text-slate-400">
              找到 <span className="font-bold text-teal-600">{monthlyBanks.length}</span> 笔交接记录
            </p>
          </div>
        )}
      </div>

      {/* ── Agent Report Tab ── */}
      {tab === 'agent' && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['总案件', agentReport.reduce((s, r) => s + r.totalCases, 0), 'bg-teal-50 border-teal-100 text-teal-700'],
              ['已完成户口', agentReport.reduce((s, r) => s + r.completedBanks, 0), 'bg-green-50 border-green-100 text-green-700'],
              ['总收费', 'RM ' + agentReport.reduce((s, r) => s + r.totalCommission, 0).toFixed(2), 'bg-purple-50 border-purple-100 text-purple-700'],
              ['总净利润', 'RM ' + agentReport.reduce((s, r) => s + r.netProfit, 0).toFixed(2), 'bg-emerald-50 border-emerald-100 text-emerald-700'],
            ].map(([label, val, cls]) => (
              <div key={label} className={`rounded-2xl border p-4 ${cls}`}>
                <p className="text-xs font-medium opacity-70">{label}</p>
                <p className="text-xl font-black mt-1">{val}</p>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Agent 绩效详情</h3>
              <button onClick={downloadAgentReport} className="px-3 py-1.5 text-xs rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold">📊 下载 Excel</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    {['Agent', '总案件', '银行户口', '已完成', '未完成', '已终止', '总收费', '总成本', '净利润'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {agentReport.map(r => (
                    <tr key={r.agent.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-100">{r.agent.display_name}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.totalCases}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.totalBanks}</td>
                      <td className="px-4 py-3"><span className="text-green-600 font-bold">{r.completedBanks}</span></td>
                      <td className="px-4 py-3"><span className={r.pendingBanks > 0 ? 'text-amber-600 font-bold' : 'text-slate-400'}>{r.pendingBanks}</span></td>
                      <td className="px-4 py-3"><span className={r.terminatedCases > 0 ? 'text-red-500 font-bold' : 'text-slate-400'}>{r.terminatedCases}</span></td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">RM {r.totalCommission.toFixed(2)}</td>
                      <td className="px-4 py-3 text-red-500">RM {r.totalCosts.toFixed(2)}</td>
                      <td className="px-4 py-3 font-bold"><span className={r.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}>RM {r.netProfit.toFixed(2)}</span></td>
                    </tr>
                  ))}
                  {agentReport.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">暂无数据</td></tr>}
                  {agentReport.length > 0 && (
                    <tr className="bg-slate-50 dark:bg-slate-800 font-bold border-t-2 border-slate-200 dark:border-slate-600">
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200">总计</td>
                      <td className="px-4 py-3">{agentReport.reduce((s, r) => s + r.totalCases, 0)}</td>
                      <td className="px-4 py-3">{agentReport.reduce((s, r) => s + r.totalBanks, 0)}</td>
                      <td className="px-4 py-3 text-green-600">{agentReport.reduce((s, r) => s + r.completedBanks, 0)}</td>
                      <td className="px-4 py-3 text-amber-600">{agentReport.reduce((s, r) => s + r.pendingBanks, 0)}</td>
                      <td className="px-4 py-3 text-red-500">{agentReport.reduce((s, r) => s + r.terminatedCases, 0)}</td>
                      <td className="px-4 py-3">RM {agentReport.reduce((s, r) => s + r.totalCommission, 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-red-500">RM {agentReport.reduce((s, r) => s + r.totalCosts, 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-emerald-600">RM {agentReport.reduce((s, r) => s + r.netProfit, 0).toFixed(2)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Pending Banks Tab ── */}
      {tab === 'pending' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {['New', 'Bank Processing', 'Ready'].map(s => (
              <div key={s} className={`rounded-2xl border p-4 ${bankStatusColor[s]}`}>
                <p className="text-xs font-medium opacity-70">{s}</p>
                <p className="text-2xl font-black mt-1">{pendingBanks.filter(b => b.status === s).length}</p>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">未完成银行户口 ({pendingBanks.length})</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    {['公司名称', 'Owner', 'Agent', '银行', '账号', '状态', '停留天数', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pendingBanks.map(b => (
                    <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100 max-w-[140px] truncate">{b.ssm?.ssm_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 max-w-[120px] truncate">{b.owner?.name || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{b.agent?.display_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{b.bank_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{b.account_no || <span className="text-red-400 font-medium">未填</span>}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${bankStatusColor[b.status] || 'bg-slate-100 text-slate-600'}`}>{b.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        {b.daysSince !== null && (
                          <span className={`text-xs font-bold ${b.daysSince > 14 ? 'text-red-600' : b.daysSince > 7 ? 'text-amber-600' : 'text-slate-500'}`}>
                            {b.daysSince} 天
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {b.cas && (
                          <button onClick={() => onNavigate('case', b.cas.id)}
                            className="px-3 py-1.5 text-xs rounded-lg bg-teal-600 text-white hover:bg-teal-700 font-medium whitespace-nowrap">
                            处理 →
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {pendingBanks.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">🎉 所有银行户口都已完成！</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Missing Data Tab ── */}
      {tab === 'missing' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              ['🔴 必填缺失', missingData.reduce((s, c) => s + c.issues.filter(i => i.severity === 'high').length, 0), 'bg-red-50 border-red-100 text-red-700'],
              ['🟡 建议填写', missingData.reduce((s, c) => s + c.issues.filter(i => i.severity === 'medium').length, 0), 'bg-amber-50 border-amber-100 text-amber-700'],
              ['受影响案件', missingData.length, 'bg-slate-50 border-slate-200 text-slate-700'],
            ].map(([label, val, cls]) => (
              <div key={label} className={`rounded-2xl border p-4 ${cls}`}>
                <p className="text-xs font-medium opacity-70">{label}</p>
                <p className="text-2xl font-black mt-1">{val}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            {missingData.map(c => (
              <div key={c.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 bg-slate-50 dark:bg-slate-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{c.ssm?.ssm_name || c.owner?.name || '—'}</p>
                      <span className="text-xs text-slate-400 font-mono">{c.case_no}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{c.owner?.name} · {c.agent?.display_name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${c.issues.some(i => i.severity === 'high') ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                      {c.issues.length} 项缺失
                    </span>
                    <button onClick={() => onNavigate('case', c.id)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-teal-600 text-white hover:bg-teal-700 font-medium">
                      去填写 →
                    </button>
                  </div>
                </div>
                <div className="px-5 py-3 flex flex-wrap gap-2">
                  {c.issues.map((issue, i) => (
                    <span key={i} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs ${sevColor[issue.severity]}`}>
                      {typeIcon[issue.type]} {issue.field}
                      <span className="opacity-60">({sevLabel[issue.severity]})</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {missingData.length === 0 && (
              <div className="text-center py-16 text-slate-400">
                <p className="text-4xl mb-2">✅</p>
                <p className="text-sm">所有案件资料都很完整！</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Monthly Report Tab ── */}
      {tab === 'monthly' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['交接总数', monthlyBanks.length, 'bg-teal-50 border-teal-100 text-teal-700'],
              ['总收费', 'RM ' + monthlyBanks.reduce((s, b) => s + (Number(b.commission) || 0), 0).toFixed(2), 'bg-purple-50 border-purple-100 text-purple-700'],
              ['总成本', 'RM ' + monthlyBanks.reduce((s, b) => s + b.totalFees, 0).toFixed(2), 'bg-red-50 border-red-100 text-red-600'],
              ['净利润', 'RM ' + monthlyBanks.reduce((s, b) => s + b.netCommission, 0).toFixed(2), 'bg-emerald-50 border-emerald-100 text-emerald-700'],
            ].map(([label, val, cls]) => (
              <div key={label} className={`rounded-2xl border p-4 ${cls}`}>
                <p className="text-xs font-medium opacity-70">{label}</p>
                <p className="text-xl font-black mt-1">{val}</p>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
                月度报表 — {filterMode === 'month' ? month : `${dateFrom || '...'} 至 ${dateTo || '...'}`}
              </h3>
              <button onClick={downloadMonthlyReport} className="px-3 py-1.5 text-xs rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold">📊 下载 Excel</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    {['公司名称', 'Owner', '银行', '账号', '交接日期', 'COM ID', 'Agent', '收费', '净佣金', ''].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {monthlyBanks.map(b => (
                    <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="px-3 py-3 font-medium text-slate-800 dark:text-slate-100 max-w-[130px] truncate">{b.ssm?.ssm_name || '—'}</td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-300 max-w-[110px] truncate">{b.owner?.name || '—'}</td>
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{b.bank_name}</td>
                      <td className="px-3 py-3 font-mono text-xs text-slate-500">{b.account_no || '—'}</td>
                      <td className="px-3 py-3 text-xs text-slate-500">{fmt(b.handover_date)}</td>
                      <td className="px-3 py-3 font-mono text-xs text-green-600">{b.com_id || '—'}</td>
                      <td className="px-3 py-3 text-xs text-slate-500">{b.agent?.display_name || '—'}</td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-300 text-xs">{b.commission ? 'RM ' + b.commission : '—'}</td>
                      <td className="px-3 py-3 text-xs font-bold"><span className={b.netCommission >= 0 ? 'text-emerald-600' : 'text-red-600'}>RM {b.netCommission.toFixed(2)}</span></td>
                      <td className="px-3 py-3">
                        {b.cas && <button onClick={() => onNavigate('case', b.cas.id)} className="px-2 py-1 text-xs rounded-lg bg-teal-50 text-teal-600 hover:bg-teal-100">查看</button>}
                      </td>
                    </tr>
                  ))}
                  {monthlyBanks.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">本月暂无交接记录</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Account Report（账户报表）────────────────────────────────────── */}
      {tab === 'accounts' && (
        <div className="space-y-4">
          {/* 账户选择 */}
          <div className="flex gap-2 flex-wrap">
            {['全部', ...companyAccounts.map(a => a.name)].map(name => (
              <button key={name} onClick={() => setSelectedAccount(name)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${selectedAccount === name ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                {name === '全部' ? '📊 全部账户' : `🏦 ${name}`}
              </button>
            ))}
          </div>

          {/* 汇总卡片 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
              <p className="text-xs text-slate-400">总进账</p>
              <p className="text-xl font-black text-green-600">RM {accountSummary.totalIn.toFixed(2)}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
              <p className="text-xs text-slate-400">总出账</p>
              <p className="text-xl font-black text-red-500">RM {accountSummary.totalOut.toFixed(2)}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
              <p className="text-xs text-slate-400">净额</p>
              <p className={`text-xl font-black ${accountSummary.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>RM {accountSummary.net.toFixed(2)}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
              <p className="text-xs text-slate-400">笔数</p>
              <p className="text-xl font-black text-slate-700 dark:text-slate-200">{accountFilteredTx.length}</p>
            </div>
          </div>

          {/* 转账/现金比例 */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">🏦 转账 / 💵 现金 比例</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-teal-50 dark:bg-teal-950 rounded-xl p-4">
                <p className="text-xs text-teal-600">🏦 转账</p>
                <p className="text-lg font-black text-teal-700">RM {accountSummary.transferAmount.toFixed(2)}</p>
                <p className="text-[10px] text-teal-500">{accountSummary.transferCount} 笔</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950 rounded-xl p-4">
                <p className="text-xs text-amber-600">💵 现金</p>
                <p className="text-lg font-black text-amber-700">RM {accountSummary.cashAmount.toFixed(2)}</p>
                <p className="text-[10px] text-amber-500">{accountSummary.cashCount} 笔</p>
              </div>
            </div>
          </div>

          {/* 月度汇总 */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">📅 月度汇总</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  {['月份', '进账', '出账', '净额'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {accountMonthly.map(m => (
                  <tr key={m.month} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-300">{m.month}</td>
                    <td className="px-4 py-2.5 text-green-600 font-medium">+RM {m.in.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-red-500 font-medium">-RM {m.out.toFixed(2)}</td>
                    <td className={`px-4 py-2.5 font-bold ${m.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>RM {m.net.toFixed(2)}</td>
                  </tr>
                ))}
                {accountMonthly.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">暂无资料</td></tr>}
              </tbody>
            </table>
          </div>

          {/* 流水明细 */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">📋 流水明细</h3>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[500px] overflow-y-auto">
              {accountFilteredTx.map(t => (
                <div key={t.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{txTypeLabels[t.type] || t.type}</span>
                      {t.company_accounts?.name && <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded-full">{t.company_accounts.name}</span>}
                      {t.payment_method && PAYMENT_METHODS[t.payment_method] && (
                        <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded-full">{PAYMENT_METHODS[t.payment_method].icon} {PAYMENT_METHODS[t.payment_method].label}</span>
                      )}
                      {t.cases?.case_no && <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded-full font-mono">{t.cases.case_no}</span>}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{fmt(t.date)} {t.note && `· ${t.note}`}</p>
                  </div>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200 flex-shrink-0">RM {Number(t.amount).toFixed(2)}</p>
                </div>
              ))}
              {accountFilteredTx.length === 0 && <div className="px-5 py-8 text-center text-slate-400 text-sm">暂无流水记录</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
