import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { CASE_STATUSES, CASE_STATUS_ICONS, CASE_STATUS_COLORS, TERMINATION_TYPES, DEPOSIT_RECOVERY_STATUSES, fmt, fmtMoney } from '../lib/constants'
import { CaseBadge, StatCard } from '../components/UI'

// 直接沿用 constants.js 的状态清单（扣掉 Completed），这样以后状态机再调整，Dashboard 会自动跟着变，不用两边维护
const WORKFLOW_STAGES = CASE_STATUSES.filter(s => s !== 'Completed')

export default function Dashboard({ currentUser, onNavigate }) {
  const [cases, setCases] = useState([])
  const [accounts, setAccounts] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    const [{ data: c }, { data: a }, { data: t }] = await Promise.all([
      supabase.from('cases').select('*, owners(name,ic), ssm(ssm_name), users!cases_agent_id_fkey(display_name)').order('created_at', { ascending: false }),
      supabase.from('company_accounts').select('*').order('name'),
      supabase.from('account_transactions').select('*').order('created_at', { ascending: false }).limit(10),
    ])
    setCases(c || [])
    setAccounts(a || [])
    setTransactions(t || [])
    setLoading(false)
  }

  const myCases = currentUser.role === 'agent'
    ? cases.filter(c => c.agent_id === currentUser.id)
    : cases

  const today = new Date().toISOString().slice(0, 10)
  const completedToday = myCases.filter(c => c.status === 'Completed' && c.updated_at?.slice(0, 10) === today)
  const pendingCases = myCases.filter(c => c.status !== 'Completed')
  const readyForHandover = myCases.filter(c => c.status === 'Ready For Handover')
  const blockedCases = myCases.filter(c => c.is_blocked && !c.termination_type)
  const recoveryPendingCases = myCases.filter(c => c.deposit_recovery_status === 'pending')

  // Stage counts
  const stageCounts = WORKFLOW_STAGES.reduce((acc, s) => {
    acc[s] = myCases.filter(c => c.status === s && !c.termination_type).length
    return acc
  }, {})

  // Finance
  const totalBalance = accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0)
  const outstandingDeposits = transactions
    .filter(t => t.type === 'deposit_out')
    .reduce((s, t) => s + (Number(t.amount) || 0), 0)

  const urgentStages = ['Ready For Handover', 'Waiting Deposit Return', 'Bank Processing']
  // 需要关注 = 卡住的案件（不管在哪个阶段）+ 处于紧急阶段的案件，卡住的排最前面
  const urgentCases = [
    ...blockedCases,
    ...myCases.filter(c => !c.is_blocked && !c.termination_type && urgentStages.includes(c.status)),
  ]

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-800 dark:text-slate-100">
            {new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">你好，{currentUser.display_name} 👋</p>
        </div>
        <button onClick={loadData} className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 transition-colors">
          {loading ? '⏳' : '🔄'}
        </button>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon="📁" label="进行中案件" value={pendingCases.length} color="bg-blue-50 border-blue-100" onClick={() => onNavigate('cases')} />
        <StatCard icon="✅" label="今日完成" value={completedToday.length} color="bg-green-50 border-green-100" onClick={() => onNavigate('cases', { status: 'Completed' })} />
        <StatCard icon="🚀" label="Ready 待交接" value={readyForHandover.length} color="bg-lime-50 border-lime-100" onClick={() => onNavigate('cases', { status: 'Ready For Handover' })} />
        <StatCard icon="⚠️" label="需要关注" value={urgentCases.length} color="bg-amber-50 border-amber-100" />
        <StatCard icon="💰" label="押金追讨中" value={recoveryPendingCases.length} color="bg-red-50 border-red-100" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Workflow pipeline */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-4">📊 工作流状态</h3>
          <div className="space-y-2">
            {WORKFLOW_STAGES.map(stage => {
              const count = stageCounts[stage] || 0
              const maxCount = Math.max(...Object.values(stageCounts), 1)
              const pct = Math.round((count / maxCount) * 100)
              return (
                <button key={stage} onClick={() => onNavigate('cases', { status: stage })}
                  className="w-full flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl px-2 py-1.5 transition-colors text-left">
                  <span className="text-base w-6 flex-shrink-0">{CASE_STATUS_ICONS[stage]}</span>
                  <span className="text-xs text-slate-600 dark:text-slate-400 w-44 flex-shrink-0 truncate">{stage}</span>
                  <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className={`text-xs font-bold w-6 text-right ${count > 0 ? 'text-slate-700 dark:text-slate-200' : 'text-slate-300'}`}>{count}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Finance + urgent */}
        <div className="space-y-4">
          {/* Company accounts - admin only */}
          {['super_admin', 'admin'].includes(currentUser.role) && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">💰 公司账户</h3>
                <button onClick={() => onNavigate('finance')} className="text-xs text-blue-500 hover:text-blue-700">查看详情 →</button>
              </div>
              {accounts.map(a => (
                <div key={a.id} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{a.name}</span>
                  <span className={`text-sm font-black ${Number(a.balance) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    RM {Number(a.balance).toLocaleString('en-MY', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
              <div className="pt-2 mt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">总余额</span>
                  <span className="text-sm font-black text-blue-600">RM {totalBalance.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          )}

          {/* Urgent cases */}
          {urgentCases.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-amber-800 dark:text-amber-200 mb-3">⚡ 需要处理</h3>
              <div className="space-y-2">
                {urgentCases.slice(0, 5).map(c => (
                  <button key={c.id} onClick={() => onNavigate('case', c.id)}
                    className="w-full text-left bg-white dark:bg-amber-900 rounded-xl px-3 py-2.5 hover:shadow-md transition-all border border-amber-100 dark:border-amber-700">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{c.ssm?.ssm_name || c.owners?.name || '—'}</p>
                    <div className="flex items-center justify-between mt-1">
                      <CaseBadge status={c.status} blocked={c.is_blocked} />
                      <span className="text-[10px] text-slate-400">{c.case_no}</span>
                    </div>
                    {c.is_blocked && c.blocked_reason && (
                      <p className="text-[10px] text-amber-600 mt-1 truncate">⚠️ {c.blocked_reason}</p>
                    )}
                  </button>
                ))}
                {urgentCases.length > 5 && (
                  <button onClick={() => onNavigate('cases')} className="w-full text-xs text-amber-600 text-center py-1 hover:text-amber-800">
                    还有 {urgentCases.length - 5} 个案件 →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Deposit recovery pending */}
          {recoveryPendingCases.length > 0 && (
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-red-800 dark:text-red-200 mb-3">💰 押金追讨中</h3>
              <div className="space-y-2">
                {recoveryPendingCases.slice(0, 5).map(c => (
                  <button key={c.id} onClick={() => onNavigate('case', c.id)}
                    className="w-full text-left bg-white dark:bg-red-900 rounded-xl px-3 py-2.5 hover:shadow-md transition-all border border-red-100 dark:border-red-700">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{c.ssm?.ssm_name || c.owners?.name || '—'}</p>
                    <div className="flex items-center justify-between mt-1">
                      <CaseBadge status={c.status} terminationType={c.termination_type} />
                      <span className="text-[10px] text-slate-400">{c.case_no}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Today's cases table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">📋 最新案件</h3>
          <button onClick={() => onNavigate('cases')} className="text-xs text-blue-500 hover:text-blue-700">查看全部 →</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                {['案件编号', '公司名称', 'Owner', 'Agent', '当前状态', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {myCases.filter(c => c.status !== 'Completed' && !c.termination_type).slice(0, 8).map(c => (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{c.case_no}</td>
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100 max-w-[160px] truncate">{c.ssm?.ssm_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300 max-w-[120px] truncate">{c.owners?.name || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{c.users?.display_name || '—'}</td>
                  <td className="px-4 py-3"><CaseBadge status={c.status} blocked={c.is_blocked} /></td>
                  <td className="px-4 py-3">
                    <button onClick={() => onNavigate('case', c.id)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium whitespace-nowrap">
                      处理 →
                    </button>
                  </td>
                </tr>
              ))}
              {myCases.filter(c => c.status !== 'Completed' && !c.termination_type).length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                  <p className="text-3xl mb-2">🎉</p>
                  <p>没有进行中的案件</p>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
