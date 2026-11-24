import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { CASE_STATUSES } from '../lib/constants'
import { CaseBadge } from '../components/UI'
import Icon from '../components/Icons'

// 沿用 constants.js 的状态清单（扣掉 Completed），状态机调整后首页会自动跟着变
const WORKFLOW_STAGES = CASE_STATUSES.filter(s => s !== 'Completed')
const URGENT_STAGES = ['Ready For Handover', 'Waiting Deposit Return', 'Bank Processing']

const money = (n) => 'RM ' + Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function timeAgo(ts) {
  if (!ts) return ''
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} 天前`
  return new Date(ts).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })
}

function Card({ title, action, onAction, children, className = '' }) {
  return (
    <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm ${className}`}>
      <div className="px-5 pt-4 pb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{title}</h3>
        {action && <button onClick={onAction} className="text-xs font-medium text-teal-600 hover:text-teal-700">{action}</button>}
      </div>
      {children}
    </div>
  )
}

function Stat({ icon, label, value, tone, onClick }) {
  const tones = {
    teal: 'bg-teal-50 text-teal-600 dark:bg-teal-950 dark:text-teal-400',
    green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
    blue: 'bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-400',
    red: 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400',
  }
  return (
    <button onClick={onClick} disabled={!onClick}
      className="text-left bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 flex items-center gap-3 hover:border-teal-300 transition-colors disabled:cursor-default disabled:hover:border-slate-200">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${tones[tone]}`}><Icon name={icon} size={20} /></div>
      <div className="min-w-0">
        <p className="text-2xl font-black text-slate-900 dark:text-white leading-none">{value}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 truncate">{label}</p>
      </div>
    </button>
  )
}

export default function Dashboard({ currentUser, onNavigate }) {
  const [cases, setCases] = useState([])
  const [accounts, setAccounts] = useState([])
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const isAdmin = ['super_admin', 'admin'].includes(currentUser.role)
  const isAgent = currentUser.role === 'agent'

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    const [{ data: c }, { data: a }, { data: t }] = await Promise.all([
      supabase.from('cases').select('*, owners(name,ic), ssm(ssm_name), users!cases_agent_id_fkey(display_name)').order('created_at', { ascending: false }),
      isAdmin ? supabase.from('company_accounts').select('*').order('name') : Promise.resolve({ data: [] }),
      supabase.from('case_timeline').select('id, case_id, action, note, done_by_name, done_at').order('done_at', { ascending: false }).limit(60),
    ])
    setCases(c || [])
    setAccounts(a || [])
    setActivity(t || [])
    setLoading(false)
  }

  const myCases = isAgent ? cases.filter(c => c.agent_id === currentUser.id) : cases
  const myIds = new Set(myCases.map(c => c.id))
  const caseMap = Object.fromEntries(cases.map(c => [c.id, c]))

  const today = new Date().toISOString().slice(0, 10)
  const completedToday = myCases.filter(c => c.status === 'Completed' && c.updated_at?.slice(0, 10) === today)
  const active = myCases.filter(c => c.status !== 'Completed' && !c.termination_type)
  const ready = myCases.filter(c => c.status === 'Ready For Handover')
  const blocked = myCases.filter(c => c.is_blocked && !c.termination_type)
  const recovery = myCases.filter(c => c.deposit_recovery_status === 'pending')
  const urgent = [
    ...blocked,
    ...myCases.filter(c => !c.is_blocked && !c.termination_type && URGENT_STAGES.includes(c.status)),
  ]

  const stageCounts = WORKFLOW_STAGES.reduce((acc, s) => {
    acc[s] = myCases.filter(c => c.status === s && !c.termination_type).length
    return acc
  }, {})
  const maxCount = Math.max(...Object.values(stageCounts), 1)

  const totalBalance = accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0)
  const recent = activity.filter(a => myIds.has(a.case_id)).slice(0, 6)

  const hour = new Date().getHours()
  const greet = hour < 12 ? '早安' : hour < 18 ? '午安' : '晚上好'
  const name = (c) => c.ssm?.ssm_name || c.owners?.name || '—'

  // 需要处理列表：卡住的 + 紧急阶段 + 押金追讨
  const actionItems = [
    ...urgent.map(c => ({ c, tag: c.is_blocked ? '卡住' : '紧急', tone: c.is_blocked ? 'red' : 'amber', note: c.is_blocked ? c.blocked_reason : c.status })),
    ...recovery.filter(c => !urgent.some(u => u.id === c.id)).map(c => ({ c, tag: '押金追讨', tone: 'amber', note: c.status })),
  ]
  const tagCls = {
    red: 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white">{greet}，{currentUser.display_name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">以下是目前案件的实时概况</p>
        </div>
        <button onClick={loadData} className="text-xs font-medium text-slate-500 hover:text-teal-600 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-900">
          {loading ? '读取中…' : '刷新'}
        </button>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Stat icon="folder" tone="teal" label="进行中案件" value={active.length} onClick={() => onNavigate('cases')} />
        <Stat icon="check" tone="green" label="今日完成" value={completedToday.length} onClick={() => onNavigate('cases', null, { status: 'Completed' })} />
        <Stat icon="alert" tone="amber" label="需要关注" value={urgent.length} />
        <Stat icon="flag" tone="blue" label="Ready 待交接" value={ready.length} onClick={() => onNavigate('cases', null, { status: 'Ready For Handover' })} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="工作流概览" className="lg:col-span-2">
          <div className="px-5 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
            {WORKFLOW_STAGES.map((stage, i) => {
              const n = stageCounts[stage] || 0
              return (
                <button key={stage} onClick={() => onNavigate('cases', null, { status: stage })}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-left">
                  <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0 ${n > 0 ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>{i + 1}</span>
                  <span className="text-xs text-slate-600 dark:text-slate-300 flex-1 truncate">{stage}</span>
                  <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 flex-shrink-0">
                    <div className="h-1.5 rounded-full bg-teal-500" style={{ width: `${Math.round((n / maxCount) * 100)}%` }} />
                  </div>
                  <span className={`text-xs font-bold w-5 text-right ${n > 0 ? 'text-slate-800 dark:text-slate-100' : 'text-slate-300 dark:text-slate-600'}`}>{n}</span>
                </button>
              )
            })}
          </div>
        </Card>

        <Card title={`需要处理${actionItems.length ? ` (${actionItems.length})` : ''}`}>
          <div className="px-3 pb-3 space-y-1.5 max-h-[340px] overflow-y-auto">
            {actionItems.length === 0 && <p className="text-xs text-slate-400 text-center py-8">目前没有需要特别处理的案件</p>}
            {actionItems.slice(0, 8).map(({ c, tag, tone, note }) => (
              <button key={c.id} onClick={() => onNavigate('case', c.id)}
                className="w-full text-left rounded-xl px-3 py-2 border border-slate-100 dark:border-slate-800 hover:border-teal-300 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{name(c)}</p>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${tagCls[tone]}`}>{tag}</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 truncate">{c.case_no}{note ? ` · ${note}` : ''}</p>
              </button>
            ))}
            {actionItems.length > 8 && <p className="text-[11px] text-slate-400 text-center pt-1">还有 {actionItems.length - 8} 个</p>}
          </div>
        </Card>
      </div>

      <div className={`grid grid-cols-1 gap-4 ${isAdmin ? 'lg:grid-cols-3' : ''}`}>
        {isAdmin && (
          <Card title="公司账户" action="查看详情 →" onAction={() => onNavigate('finance')}>
            <div className="px-5 pb-4">
              {accounts.length === 0 && <p className="text-xs text-slate-400 py-4 text-center">没有账户资料</p>}
              {accounts.map(a => (
                <div key={a.id} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <span className="text-xs text-slate-600 dark:text-slate-300 truncate pr-2">{a.name}</span>
                  <span className={`text-sm font-bold whitespace-nowrap ${Number(a.balance) >= 0 ? 'text-slate-900 dark:text-white' : 'text-red-600'}`}>{money(a.balance)}</span>
                </div>
              ))}
              {accounts.length > 0 && (
                <div className="flex items-center justify-between pt-3 mt-1 border-t border-slate-200 dark:border-slate-700">
                  <span className="text-xs font-semibold text-slate-500">总余额</span>
                  <span className={`text-sm font-black ${totalBalance >= 0 ? 'text-teal-600' : 'text-red-600'}`}>{money(totalBalance)}</span>
                </div>
              )}
            </div>
          </Card>
        )}

        <Card title="最新案件" action="查看全部 →" onAction={() => onNavigate('cases')} className={isAdmin ? 'lg:col-span-2' : ''}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50">
                  {['案件编号', '公司', 'Owner', 'Agent', '状态', '更新'].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {active.slice(0, 6).map(c => (
                  <tr key={c.id} onClick={() => onNavigate('case', c.id)}
                    className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer">
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{c.case_no}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100 max-w-[170px] truncate">{c.ssm?.ssm_name || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 max-w-[120px] truncate">{c.owners?.name || '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{c.users?.display_name || '—'}</td>
                    <td className="px-4 py-2.5"><CaseBadge status={c.status} blocked={c.is_blocked} /></td>
                    <td className="px-4 py-2.5 text-xs text-slate-400 whitespace-nowrap">{timeAgo(c.updated_at || c.created_at)}</td>
                  </tr>
                ))}
                {active.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-xs text-slate-400">没有进行中的案件</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card title="最近动态">
        <div className="px-5 pb-4">
          {recent.length === 0 && <p className="text-xs text-slate-400 py-4 text-center">暂无动态</p>}
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {recent.map(a => (
              <button key={a.id} onClick={() => onNavigate('case', a.case_id)} className="w-full flex items-start gap-3 py-2.5 text-left">
                <span className="w-2 h-2 rounded-full bg-teal-500 mt-1.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-700 dark:text-slate-200 truncate">
                    <span className="font-semibold">{a.action}</span>
                    {caseMap[a.case_id] ? ` · ${name(caseMap[a.case_id])}` : ''}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">{a.done_by_name || ''}{a.note ? ` · ${a.note}` : ''}</p>
                </div>
                <span className="text-[11px] text-slate-400 whitespace-nowrap">{timeAgo(a.done_at)}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}
