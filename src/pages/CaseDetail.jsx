import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { CASE_STATUSES, CASE_STATUS_ICONS, BANKS, BANK_STATUSES, COST_CATEGORIES, FILE_CATS, TERMINATION_TYPES, DEPOSIT_RECOVERY_STATUSES, DEPOSIT_RECOVERY_TARGETS, PAYMENT_METHODS, fmt, fmtDateTime, fmtMoney } from '../lib/constants'
import { CaseBadge, BankBadge, Modal, Field, Inp, Sel, InfoRow, Secret } from '../components/UI'
import { generateBankReport, printBankReportPDF } from '../lib/reportGenerator'
import { getFileUrl, uploadIcFile, uploadPrivateFile } from '../lib/fileUrl'
import PayerSelect from '../components/PayerSelect'

const TABS = [
  { id: 'timeline', label: '⏱ 时间线' },
  { id: 'profile',  label: '👤 资料' },
  { id: 'bank',     label: '🏦 银行' },
  { id: 'deposit',  label: '💰 Deposit' },
  { id: 'costs',    label: '💵 费用' },
  { id: 'payments', label: '💳 收款' },
  { id: 'docs',     label: '📁 文件' },
]

export default function CaseDetail({ caseId, currentUser, onBack, toast }) {
  const [cas, setCas] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [banks, setBanks] = useState([])
  const [deposits, setDeposits] = useState([])
  const [depositReturns, setDepositReturns] = useState([])
  const [costs, setCosts] = useState([])
  const [payments, setPayments] = useState([])
  const [comms, setComms] = useState([])
  const [commPays, setCommPays] = useState([])
  const [agentName, setAgentName] = useState('')
  const [showAddPayment, setShowAddPayment] = useState(null) // 'payment' | 'refund'
  const [showFeeModal, setShowFeeModal] = useState(false)
  const [files, setFiles] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('timeline')

  // Modals
  const [showStatusChange, setShowStatusChange] = useState(false)
  const [showBlockModal, setShowBlockModal] = useState(false)
  const [showTerminateModal, setShowTerminateModal] = useState(false)
  const [showUnterminateModal, setShowUnterminateModal] = useState(false)
  const [showRecoveryModal, setShowRecoveryModal] = useState(false)
  const [showAddTimeline, setShowAddTimeline] = useState(false)
  const [showEditProfile, setShowEditProfile] = useState(false)
  const [showAddBank, setShowAddBank] = useState(false)
  const [showAddDeposit, setShowAddDeposit] = useState(false)
  const [showAddReturn, setShowAddReturn] = useState(false)
  const [activeReturnDeposit, setActiveReturnDeposit] = useState(null)
  const [showAddCost, setShowAddCost] = useState(false)
  const [editCost, setEditCost] = useState(null)
  const [editBank, setEditBank] = useState(null)
  const [editDeposit, setEditDeposit] = useState(null)

  useEffect(() => { loadAll() }, [caseId])

  const loadAll = async () => {
    setLoading(true)
    const [{ data: c }, { data: tl }, { data: b }, { data: d }, { data: co }, { data: f }, { data: acc }] = await Promise.all([
      supabase.from('cases').select('*, owners(*), ssm(*), users!cases_agent_id_fkey(display_name,id)').eq('id', caseId).single(),
      supabase.from('case_timeline').select('*, users(display_name)').eq('case_id', caseId).order('done_at', { ascending: true }),
      supabase.from('bank_accounts').select('*').eq('ssm_id', caseId).order('created_at'),
      supabase.from('deposits').select('*, bank_accounts(bank_name,account_no), company_accounts!account_id(name)').eq('ssm_id', caseId).order('created_at', { ascending: false }),
      supabase.from('case_costs').select('*').eq('case_id', caseId).order('created_at', { ascending: false }),
      supabase.from('files').select('*').eq('ssm_id', caseId).order('created_at', { ascending: false }),
      supabase.from('company_accounts').select('*').order('name'),
    ])
    // bank_accounts uses ssm_id not case_id - try owner's ssm
    let bankData = b || []
    if (c?.ssm_id) {
      const { data: bb } = await supabase.from('bank_accounts').select('*').eq('ssm_id', c.ssm_id).order('created_at')
      bankData = bb || []
    }
    let depositData = d || []
    if (c?.ssm_id) {
      const { data: dd } = await supabase.from('deposits').select('*, bank_accounts(bank_name,account_no), company_accounts!account_id(name)').eq('ssm_id', c.ssm_id).order('created_at', { ascending: false })
      depositData = dd || []
    }
    let fileData = f || []
    if (c?.ssm_id) {
      const { data: ff } = await supabase.from('files').select('*').eq('ssm_id', c.ssm_id).order('created_at', { ascending: false })
      fileData = ff || []
    }
    // 抓取这个案件下所有押金的回款记录（一笔押金可能分好几次、不同账户、不同方式回来）
    let returnData = []
    if (depositData.length > 0) {
      const { data: rr } = await supabase.from('deposit_returns')
        .select('*, company_accounts(name)')
        .in('deposit_id', depositData.map(d => d.id))
        .order('return_date', { ascending: false })
      returnData = rr || []
    }
    setCas(c); setTimeline(tl || []); setBanks(bankData); setDeposits(depositData); setDepositReturns(returnData)
    setCosts(co || []); setFiles(fileData); setAccounts(acc || [])
    const { data: pay } = await supabase.from('case_payments').select('*').eq('case_id', caseId).order('payment_date', { ascending: true }).order('created_at', { ascending: true })
    setPayments(pay || [])
    if (currentUser.role !== 'agent') {
      const { data: cm } = await supabase.from('commissions').select('*').eq('case_id', caseId).order('created_at')
      setComms(cm || [])
      if (cm?.length) { const { data: cp } = await supabase.from('commission_payments').select('*').in('commission_id', cm.map(x => x.id)).order('paid_date'); setCommPays(cp || []) } else setCommPays([])
      if (c?.agent_id) { const { data: u } = await supabase.from('users').select('display_name').eq('id', c.agent_id).maybeSingle(); setAgentName(u?.display_name || '') }
    }
    setLoading(false)
  }

  const logTimeline = async (action, note) => {
    await supabase.from('case_timeline').insert({
      case_id: caseId, action, note,
      done_by: currentUser.id, done_by_name: currentUser.display_name,
    })
  }

  // 新增一笔回款记录：这笔押金可能分好几次、不同账户、不同方式陆续回来
  const saveReturn = async (depositId, { account_id, payment_method, amount, return_date, note }) => {
    if (!amount || !account_id) { toast('请填写金额并选择账户', 'error'); return }

    const { error: insertError } = await supabase.from('deposit_returns').insert({
      deposit_id: depositId, account_id, payment_method, amount: Number(amount),
      return_date: return_date || null, note: note || '', created_by: currentUser.id,
    })
    if (insertError) { toast('保存失败：' + insertError.message, 'error'); return }

    // 回款是钱回到公司账户，所以是加钱，不是扣钱
    const acc = accounts.find(a => a.id === account_id)
    if (acc) {
      await supabase.from('company_accounts').update({
        balance: (Number(acc.balance) || 0) + (Number(amount) || 0), updated_at: new Date(),
      }).eq('id', account_id)
      const dep = deposits.find(d => d.id === depositId)
      await supabase.from('account_transactions').insert({
        account_id, bank_account_id: dep?.bank_account_id, case_id: caseId,
        type: 'deposit_return', amount: Number(amount), payment_method,
        reference: `Deposit Return`, date: return_date || new Date(),
        note: note || '', created_by: currentUser.id,
      })
    }

    // 重新计算这笔押金总共已回多少，同步更新 deposits 欄位（给 Finance 页面等其他地方用）
    const { data: allReturns } = await supabase.from('deposit_returns').select('amount').eq('deposit_id', depositId)
    const totalReturnedForDeposit = (allReturns || []).reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const dep = deposits.find(d => d.id === depositId)
    const netAmt = dep ? ((dep.transfer_amount !== null && dep.transfer_amount !== undefined) ? Number(dep.transfer_amount) : (Number(dep.amount) || 0) - (Number(dep.bank_charge) || 0)) : 0
    await supabase.from('deposits').update({
      returned_amount: totalReturnedForDeposit,
      status: totalReturnedForDeposit >= netAmt ? 'returned' : 'pending',
      updated_at: new Date(),
    }).eq('id', depositId)

    await logTimeline('💰 新增回款记录', `RM ${Number(amount).toFixed(2)} · ${PAYMENT_METHODS[payment_method]?.label || payment_method} · ${acc?.name || ''}`)
    toast('回款记录已保存')
    setShowAddReturn(false); setActiveReturnDeposit(null)
    loadAll()
  }
  const changeStatus = async (newStatus, note) => {
    const old = cas.status
    await supabase.from('cases').update({ status: newStatus, updated_at: new Date() }).eq('id', caseId)
    await logTimeline(`状态更新：${newStatus}`, note || `从「${old}」推进到「${newStatus}」`)
    toast(`状态已更新为：${newStatus}`)
    loadAll()
  }

  // 标记案件卡住（不改变当前阶段，只是附加警示 + 原因）
  const blockCase = async (reason) => {
    await supabase.from('cases').update({ is_blocked: true, blocked_reason: reason, blocked_at: new Date() }).eq('id', caseId)
    await logTimeline('⚠️ 案件已标记为卡住', reason)
    toast('已标记为卡住', 'warn')
    setShowBlockModal(false); loadAll()
  }

  // 解除卡住标记
  const unblockCase = async () => {
    await supabase.from('cases').update({ is_blocked: false, blocked_reason: null, blocked_at: null }).eq('id', caseId)
    await logTimeline('✅ 卡住标记已解除', '')
    toast('已解除卡住标记')
    loadAll()
  }

  // 终止案件（被拒 / 撤回）。如果押金已经垫付出去，需要额外记录追讨状态
  const terminateCase = async (type, reason, needsRecovery) => {
    const update = {
      termination_type: type, termination_reason: reason,
      is_blocked: false, blocked_reason: null, blocked_at: null,
      updated_at: new Date(),
    }
    if (needsRecovery) update.deposit_recovery_status = 'pending'
    await supabase.from('cases').update(update).eq('id', caseId)
    await logTimeline(`${TERMINATION_TYPES[type].icon} 案件已终止：${TERMINATION_TYPES[type].label}`, reason)
    toast('案件已终止', 'warn')
    setShowTerminateModal(false); loadAll()
  }

  // 撤销终止（只有 super_admin 能操作，必须填写原因）
  const unterminateCase = async (reason) => {
    await supabase.from('cases').update({
      termination_type: null, termination_reason: null,
      deposit_recovery_status: null, deposit_recovery_target: null, deposit_recovery_note: null,
      updated_at: new Date(),
    }).eq('id', caseId)
    await logTimeline('↩️ 终止已撤销，案件恢复正常流程', reason)
    toast('已撤销终止')
    setShowUnterminateModal(false); loadAll()
  }

  // 更新押金追讨结果；如果最终结果是「公司吸收」，自动在费用明细里生成一笔亏损记录
  const updateRecovery = async (status, target, note) => {
    await supabase.from('cases').update({
      deposit_recovery_status: status, deposit_recovery_target: target, deposit_recovery_note: note,
    }).eq('id', caseId)
    if (status === 'company_absorbed' && outstandingDeposit > 0) {
      await supabase.from('case_costs').insert({
        case_id: caseId, category: 'other',
        amount: outstandingDeposit, note: `押金追讨失败，公司吸收（${note || '无备注'}）`,
        created_by: currentUser.id,
      })
    }
    await logTimeline('💰 押金追讨结果已更新', `${DEPOSIT_RECOVERY_STATUSES[status]?.label || status}${note ? ' · ' + note : ''}`)
    toast('已更新')
    setShowRecoveryModal(false); loadAll()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-slate-500">加载案件资料...</p>
      </div>
    </div>
  )

  if (!cas) return <div className="text-center py-16 text-slate-400">案件不存在</div>

  const owner = cas.owners
  const ssm = cas.ssm
  const totalCosts = costs.reduce((s, c) => s + (Number(c.amount) || 0), 0)
  const totalBankCommission = banks.reduce((s, b) => s + (Number(b.commission) || 0), 0)
  // 应收总额：有手动填「应收总额」就用它，没有就用各银行户口的「收费」加总
  const hasServiceFee = cas.service_fee !== null && cas.service_fee !== undefined
  const totalRevenue = hasServiceFee ? Number(cas.service_fee) : totalBankCommission
  const totalReceived = payments.reduce((s, p) => s + (p.kind === 'refund' ? -1 : 1) * (Number(p.amount) || 0), 0)
  const outstandingFee = totalRevenue - totalReceived
  const netProfit = totalRevenue - totalCosts
  // 优先用 deposit_returns 这份回款清单即时加总（一笔押金可能分好几次回来）
  // 清单里没有资料的旧押金，才退回用 returned_amount 欄位或状态推算，保持兼容旧数据
  const getReturnedAmount = (d) => {
    const returnsForThis = depositReturns.filter(r => r.deposit_id === d.id)
    if (returnsForThis.length > 0) return returnsForThis.reduce((s, r) => s + (Number(r.amount) || 0), 0)
    if (d.returned_amount !== null && d.returned_amount !== undefined) return Number(d.returned_amount) || 0
    if (d.status === 'returned') return (Number(d.amount) || 0) - (Number(d.bank_charge) || 0)
    return 0
  }
  // 净额优先用手动修正过的 transfer_amount，没有才用「金额 - 手续费」自动算
  const getNetAmount = (d) => (d.transfer_amount !== null && d.transfer_amount !== undefined) ? Number(d.transfer_amount) : (Number(d.amount) || 0) - (Number(d.bank_charge) || 0)
  const totalDeposit = deposits.reduce((s, d) => s + (Number(d.amount) || 0), 0)
  const totalNetDeposit = deposits.reduce((s, d) => s + getNetAmount(d), 0)
  const totalReturned = deposits.reduce((s, d) => s + getReturnedAmount(d), 0)
  // 待回 = 净额总和 - 已回金额
  const outstandingDeposit = totalNetDeposit - totalReturned

  const currentStatusIndex = CASE_STATUSES.indexOf(cas.status)
  const nextStatus = CASE_STATUSES[currentStatusIndex + 1]
  const isTerminated = !!cas.termination_type
  // 押金已经垫付出去了吗？（Deposit Out 阶段或之后，且真的有 deposit 记录）
  const depositAlreadyOut = currentStatusIndex >= CASE_STATUSES.indexOf('Deposit Out') && deposits.length > 0

  return (
    <div className="space-y-4">
      {/* Back + header */}
      <div>
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-500 hover:text-teal-600 mb-3 transition-colors">
          ← 返回案件列表
        </button>
        <div className="bg-gradient-to-r from-teal-700 to-teal-600 rounded-2xl p-5 text-white">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono bg-white/20 px-2 py-0.5 rounded-full">{cas.case_no}</span>
                <CaseBadge status={cas.status} blocked={cas.is_blocked} terminationType={cas.termination_type} />
              </div>
              <h1 className="text-xl font-black truncate">{ssm?.ssm_name || owner?.name || '未命名案件'}</h1>
              <p className="text-teal-200 text-sm mt-1">
                {owner?.name} {owner?.ic && `· ${owner.ic}`} {cas.users?.display_name && `· ${cas.users.display_name}`}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {!isTerminated && nextStatus && currentUser.role !== 'viewer' && (
                <button onClick={() => setShowStatusChange(true)}
                  className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-bold transition-colors">
                  {CASE_STATUS_ICONS[nextStatus]} 推进到 {nextStatus}
                </button>
              )}
              {!isTerminated && currentUser.role !== 'viewer' && (
                cas.is_blocked
                  ? <button onClick={unblockCase} className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-bold transition-colors">✅ 解除卡住</button>
                  : <button onClick={() => setShowBlockModal(true)} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm transition-colors">⚠️ 标记卡住</button>
              )}
              {!isTerminated && currentUser.role !== 'viewer' && (
                <button onClick={() => setShowTerminateModal(true)}
                  className="px-4 py-2 bg-red-500/30 hover:bg-red-500/50 rounded-xl text-sm transition-colors">
                  🛑 终止案件
                </button>
              )}
              {currentUser.role !== 'viewer' && (
                <button onClick={() => { setShowAddTimeline(true) }}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm transition-colors">
                  + 添加备注
                </button>
              )}
            </div>
          </div>

          {/* Blocked 警示横幅 */}
          {cas.is_blocked && !isTerminated && (
            <div className="mt-3 bg-amber-400/20 border border-amber-300/40 rounded-xl px-4 py-2.5 text-sm">
              ⚠️ <b>此案件已标记为卡住</b>{cas.blocked_reason && `：${cas.blocked_reason}`}
              {cas.blocked_at && <span className="text-amber-100 text-xs ml-2">（{fmtDateTime(cas.blocked_at)}）</span>}
            </div>
          )}

          {/* 终止横幅 */}
          {isTerminated && (
            <div className="mt-3 bg-red-500/20 border border-red-300/40 rounded-xl px-4 py-2.5 text-sm flex items-center justify-between flex-wrap gap-2">
              <span>
                {TERMINATION_TYPES[cas.termination_type]?.icon} <b>案件已{TERMINATION_TYPES[cas.termination_type]?.label}</b>
                {cas.termination_reason && `：${cas.termination_reason}`}
              </span>
              {currentUser.role === 'super_admin' && (
                <button onClick={() => setShowUnterminateModal(true)}
                  className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium whitespace-nowrap">
                  ↩️ 撤销终止
                </button>
              )}
            </div>
          )}

          {/* 押金追讨卡片 */}
          {cas.deposit_recovery_status && (
            <div className="mt-3 bg-white/10 rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm">
                💰 <b>押金追讨：</b>
                <span className={`inline-block ml-1 px-2 py-0.5 rounded-full text-xs font-medium ${DEPOSIT_RECOVERY_STATUSES[cas.deposit_recovery_status]?.color}`}>
                  {DEPOSIT_RECOVERY_STATUSES[cas.deposit_recovery_status]?.label}
                </span>
                {cas.deposit_recovery_target && <span className="text-teal-200 text-xs ml-2">追讨对象：{DEPOSIT_RECOVERY_TARGETS[cas.deposit_recovery_target]}</span>}
              </div>
              {currentUser.role !== 'viewer' && (
                <button onClick={() => setShowRecoveryModal(true)} className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium">更新追讨结果</button>
              )}
            </div>
          )}

          {/* Quick stats */}
          <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-white/20">
            <div className="text-center">
              <p className="text-xl font-black">{banks.length}</p>
              <p className="text-xs text-teal-200">银行户口</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-black">{files.length}</p>
              <p className="text-xs text-teal-200">文件</p>
            </div>
            <div className="text-center">
              <p className={`text-xl font-black ${netProfit >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                RM {Math.abs(netProfit).toFixed(0)}
              </p>
              <p className="text-xs text-teal-200">净利润</p>
            </div>
            <div className="text-center">
              <p className={`text-xl font-black ${outstandingDeposit > 0 ? 'text-yellow-300' : 'text-green-300'}`}>
                RM {outstandingDeposit.toFixed(0)}
              </p>
              <p className="text-xs text-teal-200">待回 Deposit</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-5 py-3.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.id ? 'border-teal-600 text-teal-600 dark:text-teal-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}>{t.label}</button>
          ))}
        </div>

        <div className="p-5">
          {/* ── Timeline ── */}
          {tab === 'timeline' && (
            <div className="space-y-1">
              {timeline.length === 0 && <p className="text-slate-400 text-sm text-center py-8">暂无记录</p>}
              <div className="relative">
                {timeline.map((item, i) => (
                  <div key={item.id} className="flex gap-4 pb-6 relative">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900 border-2 border-teal-400 flex items-center justify-center text-xs font-bold text-teal-700 dark:text-teal-300 flex-shrink-0 z-10">
                        {i + 1}
                      </div>
                      {i < timeline.length - 1 && <div className="w-0.5 flex-1 bg-slate-200 dark:bg-slate-700 mt-1" />}
                    </div>
                    <div className="flex-1 min-w-0 pb-2">
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{item.action}</p>
                      {item.note && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{item.note}</p>}
                      <p className="text-[10px] text-slate-400 mt-1">
                        {item.done_by_name || item.users?.display_name || '系统'} · {fmtDateTime(item.done_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {/* Workflow progress */}
              <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                <p className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wide">案件进度</p>
                <div className="space-y-2">
                  {CASE_STATUSES.map((s, i) => {
                    const done = i < currentStatusIndex
                    const current = i === currentStatusIndex
                    return (
                      <div key={s} className={`flex items-center gap-3 px-3 py-2 rounded-xl ${current ? 'bg-teal-50 dark:bg-teal-950 border border-teal-200 dark:border-teal-800' : done ? 'opacity-50' : 'opacity-30'}`}>
                        <span className="text-base">{done ? '✅' : current ? '🔵' : '⚪'}</span>
                        <span className={`text-xs font-medium ${current ? 'text-teal-700 dark:text-teal-300' : 'text-slate-600 dark:text-slate-400'}`}>{s}</span>
                        {current && <span className="ml-auto text-[10px] bg-teal-600 text-white px-2 py-0.5 rounded-full">当前</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Profile ── */}
          {tab === 'profile' && (
            <div className="space-y-5">
              {currentUser.role !== 'viewer' && (
                <button onClick={() => setShowEditProfile(true)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium hover:bg-slate-200 transition-colors">
                  ✏️ 编辑资料
                </button>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Owner */}
                <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-5">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">👤 Owner 资料</p>
                  <InfoRow label="姓名" value={owner?.name} />
                  <InfoRow label="IC No." value={owner?.ic} secret />
                  <InfoRow label="母亲姓名" value={owner?.mother_name} />
                  <InfoRow label="电话" value={owner?.phone} />
                  <InfoRow label="Email" value={owner?.email} />
                  <InfoRow label="地址" value={owner?.address} />
                </div>
                {/* SSM */}
                <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-5">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">🏢 SSM 资料</p>
                  <InfoRow label="公司名称" value={ssm?.ssm_name} />
                  <InfoRow label="注册号" value={ssm?.reg_no} />
                  <InfoRow label="注册日期" value={ssm?.reg_date} />
                  <InfoRow label="到期日期" value={ssm?.exp_date} />
                  <InfoRow label="地址" value={ssm?.address} />
                  <InfoRow label="EZBIZ User ID" value={ssm?.ezbiz_user_id} />
                  <InfoRow label="EZBIZ 密码" value={ssm?.ezbiz_password} secret />
                  {ssm?.fee_ssm > 0 && <InfoRow label="SSM 注册费" value={fmtMoney(ssm.fee_ssm)} />}
                  {ssm?.fee_contract > 0 && <InfoRow label="合同费" value={fmtMoney(ssm.fee_contract)} />}
                  {ssm?.fee_chop > 0 && <InfoRow label="做 Chop 费" value={fmtMoney(ssm.fee_chop)} />}
                </div>
              </div>
            </div>
          )}

          {/* ── Bank ── */}
          {tab === 'bank' && (
            <div className="space-y-4">
              {currentUser.role !== 'viewer' && (
                <button onClick={() => { setEditBank(null); setShowAddBank(true) }}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-colors">
                  + 新增银行户口
                </button>
              )}
              {banks.length === 0 && <p className="text-slate-400 text-sm text-center py-8">暂无银行户口</p>}
              {banks.map(b => (
                <div key={b.id} className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                  <div className="bg-slate-50 dark:bg-slate-800 px-5 py-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">🏦</span>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-100">{b.bank_name}</p>
                        <p className="text-xs text-slate-500">{b.account_no || '未填账号'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <BankBadge status={b.status} />
                      {b.com_id && <span className="text-xs font-mono bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{b.com_id}</span>}
                      {currentUser.role !== 'viewer' && currentUser.role !== 'agent' && (
                        <>
                          {[['zh', '中'], ['en', 'EN']].map(([lg, lb]) => (
                            <span key={lg} className="inline-flex items-center gap-1">
                              <button onClick={() => generateBankReport({ companyName: ssm?.ssm_name || owner?.name, caseNo: cas.case_no, ssm, owner, bank: b, lang: lg })}
                                className="px-2 py-1 text-xs rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200" title={lg === 'en' ? 'Download Word (English)' : '下载 Word（中文）'}>📄 Word {lb}</button>
                              <button onClick={() => printBankReportPDF({ companyName: ssm?.ssm_name || owner?.name, caseNo: cas.case_no, ssm, owner, bank: b, lang: lg })}
                                className="px-2 py-1 text-xs rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200" title={lg === 'en' ? 'Print / Save as PDF (English)' : '打印 / 另存为 PDF（中文）'}>🖨️ PDF {lb}</button>
                            </span>
                          ))}
                        </>
                      )}
                      {currentUser.role !== 'viewer' && (
                        <button onClick={() => { setEditBank(b); setShowAddBank(true) }}
                          className="px-2 py-1 text-xs rounded-lg bg-teal-50 text-teal-600 hover:bg-teal-100">编辑</button>
                      )}
                    </div>
                  </div>
                  <div className="px-5 py-3 grid grid-cols-1 md:grid-cols-2 gap-x-8">
                    <div>
                      <InfoRow label="账号" value={b.account_no} secret />
                      <InfoRow label="分行" value={b.branch} />
                      <InfoRow label="银行 Email" value={b.bank_email} />
                      <InfoRow label="开户日期" value={b.open_date} />
                      <InfoRow label="交接日期" value={b.handover_date} />
                      <InfoRow label="收费" value={b.commission ? fmtMoney(b.commission) : null} />
                    </div>
                    <div>
                      {(b.ob_user_id || b.ob_password) && <>
                        <p className="text-[10px] font-bold text-teal-500 uppercase tracking-wide py-2">🔐 网上银行</p>
                        <InfoRow label="用户名" value={b.ob_user_id} />
                        <InfoRow label="密码" value={b.ob_password} secret />
                        {b.bank_name === 'RHB' && <><InfoRow label="Corporate ID" value={b.corp_id} /><InfoRow label="Secure Plus" value={b.secure_plus_serial} /></>}
                        {b.bank_name === 'Maybank' && <><InfoRow label="Login ID" value={b.login_id} /><InfoRow label="Access ID" value={b.access_id} /><InfoRow label="Access Number" value={b.access_number} /></>}
                        {b.bank_name === 'OCBC' && <InfoRow label="Organisation ID" value={b.organisation_id} />}
                        {b.bank_name === 'Affin' && <><InfoRow label="Corporate ID" value={b.corp_id} /><InfoRow label="Temporary Password" value={b.temp_password} secret /></>}
                      </>}
                      {(b.security_qa || []).filter(q => q.q).length > 0 && <>
                        <p className="text-[10px] font-bold text-purple-500 uppercase tracking-wide py-2">🔒 安全问题</p>
                        {(b.security_qa || []).filter(q => q.q).map((q, i) => (
                          <div key={i}><InfoRow label={`问题 ${i + 1}`} value={q.q} /><InfoRow label={`答案 ${i + 1}`} value={q.a} secret /></div>
                        ))}
                      </>}
                      {(b.atm_card_no || b.atm_pin) && <>
                        <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wide py-2">💳 ATM</p>
                        <InfoRow label="卡号" value={b.atm_card_no} secret />
                        <InfoRow label="PIN" value={b.atm_pin} secret />
                        <InfoRow label="TAC Phone" value={b.tac_phone} />
                      </>}
                    </div>
                  </div>
                  {/* Bank fees */}
                  {(b.fee_deposit > 0 || b.fee_bank_charge > 0 || b.fee_card > 0 || b.fee_simcard > 0 || b.fee_forex > 0) && (
                    <div className="px-5 py-3 bg-amber-50 dark:bg-amber-950 border-t border-amber-100 dark:border-amber-900">
                      <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide mb-2">💰 费用明细</p>
                      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-center">
                        {[['Deposit', b.fee_deposit], ['Bank Charge', b.fee_bank_charge], ['Card', b.fee_card], ['SIM Card', b.fee_simcard], ['Forex', b.fee_forex], ['其他', b.fee_others]].filter(([, v]) => v > 0).map(([label, val]) => (
                          <div key={label} className="bg-white dark:bg-amber-900 rounded-lg py-2">
                            <p className="text-[10px] text-amber-500">{label}</p>
                            <p className="text-xs font-bold text-amber-700 dark:text-amber-300">RM {Number(val).toFixed(2)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {currentUser.role !== 'agent' && (
                    <BankCommissions bank={b} caseId={caseId} comms={comms.filter(x => x.bank_account_id === b.id)} pays={commPays}
                      agentName={agentName} currentUser={currentUser} toast={toast} onChanged={loadAll} />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Deposit ── */}
          {tab === 'deposit' && (
            <div className="space-y-4">
              {/* Summary */}
              {deposits.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  {[['💸 总 Deposit', totalDeposit, 'blue'], ['✅ 已回', totalReturned, 'green'], ['⏳ 待回', outstandingDeposit, outstandingDeposit > 0 ? 'amber' : 'green']].map(([label, val, color]) => (
                    <div key={label} className={`bg-${color}-50 dark:bg-${color}-950 border border-${color}-100 dark:border-${color}-900 rounded-xl p-3 text-center`}>
                      <p className={`text-xs text-${color}-500 mb-0.5`}>{label}</p>
                      <p className={`text-sm font-black text-${color}-700 dark:text-${color}-300`}>RM {Number(val).toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              )}

              {currentUser.role !== 'viewer' && (
                <button onClick={() => { setEditDeposit(null); setShowAddDeposit(true) }}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-colors">
                  + 新增 Deposit 记录
                </button>
              )}

              {deposits.length === 0 && <p className="text-slate-400 text-sm text-center py-8">暂无 Deposit 记录</p>}
              {deposits.map(d => {
                const transferred = (d.transfer_amount !== null && d.transfer_amount !== undefined) ? Number(d.transfer_amount) : (Number(d.amount) || 0) - (Number(d.bank_charge) || 0)
                const outstanding = transferred - getReturnedAmount(d)
                return (
                  <div key={d.id} className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                    <div className="bg-slate-50 dark:bg-slate-800 px-5 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${d.status === 'returned' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                          {d.status === 'returned' ? '✅ 已回' : '⏳ 待回'}
                        </span>
                        <span className="text-xs text-slate-500">{d.bank_accounts?.bank_name} {d.bank_accounts?.account_no && `— ${d.bank_accounts.account_no}`}</span>
                      </div>
                      {currentUser.role !== 'viewer' && (
                        <button onClick={() => { setEditDeposit(d); setShowAddDeposit(true) }}
                          className="px-2 py-1 text-xs rounded-lg bg-teal-50 text-teal-600 hover:bg-teal-100">编辑</button>
                      )}
                    </div>
                    <div className="px-5 py-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center mb-3">
                        {[['Deposit', d.amount, 'blue'], ['Bank Charge', d.bank_charge || 0, 'red'], ['转出金额', transferred, 'green'], ['待回', outstanding, outstanding > 0 ? 'amber' : 'green']].map(([label, val, color]) => (
                          <div key={label} className={`bg-${color}-50 rounded-lg py-2`}>
                            <p className={`text-[10px] text-${color}-400`}>{label}</p>
                            <p className={`text-sm font-bold text-${color}-700`}>RM {Number(val).toFixed(2)}</p>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-0.5 text-xs text-slate-500">
                        {d.depositor && <p>存款人：<span className="font-medium text-slate-700">{d.depositor}</span></p>}
                        {d.company_accounts?.name && <p>来自：<span className="font-medium text-slate-700">{d.company_accounts.name}</span></p>}
                        {d.transfer_to && <p>转给：<span className="font-medium text-slate-700">{d.transfer_to}</span> {d.transfer_to_account && `(${d.transfer_to_account})`}</p>}
                        {d.transfer_date && <p>转出日期：{d.transfer_date}</p>}
                        {d.notes && <p>备注：{d.notes}</p>}
                      </div>

                      {/* 回款记录清单（一笔押金可能分好几次、不同账户、不同方式回来） */}
                      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-bold text-slate-500">回款记录</p>
                          {currentUser.role !== 'viewer' && (
                            <button onClick={() => { setActiveReturnDeposit(d); setShowAddReturn(true) }}
                              className="text-xs text-teal-600 hover:text-teal-800 font-medium">+ 添加回款</button>
                          )}
                        </div>
                        {depositReturns.filter(r => r.deposit_id === d.id).length === 0 ? (
                          <p className="text-xs text-slate-300 text-center py-2">暂无回款记录</p>
                        ) : (
                          <div className="space-y-1.5">
                            {depositReturns.filter(r => r.deposit_id === d.id).map(r => (
                              <div key={r.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2">
                                <div className="text-xs">
                                  <span className="font-bold text-green-600">+RM {Number(r.amount).toFixed(2)}</span>
                                  <span className="text-slate-400 ml-2">{PAYMENT_METHODS[r.payment_method]?.icon} {PAYMENT_METHODS[r.payment_method]?.label} → {r.company_accounts?.name || '—'}</span>
                                </div>
                                <span className="text-[10px] text-slate-400">{r.return_date || '—'}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Costs ── */}
          {tab === 'costs' && (
            <div className="space-y-4">
              {/* P&L Summary */}
              <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-2xl p-5 text-white">
                <p className="text-xs text-slate-300 mb-3 uppercase tracking-wide">损益概览</p>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-black text-green-400">RM {totalRevenue.toFixed(2)}</p>
                    <p className="text-xs text-slate-300">总收费（应收）</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-red-400">RM {totalCosts.toFixed(2)}</p>
                    <p className="text-xs text-slate-300">总成本</p>
                  </div>
                  <div>
                    <p className={`text-2xl font-black ${netProfit >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                      RM {netProfit.toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-300">净利润</p>
                  </div>
                </div>
              </div>

              {currentUser.role !== 'viewer' && (
                <button onClick={() => setShowAddCost(true)}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-colors">
                  + 新增费用
                </button>
              )}

              {/* Cost list */}
              {costs.length === 0 && <p className="text-slate-400 text-sm text-center py-8">暂无费用记录</p>}
              <div className="space-y-2">
                {costs.map(c => {
                  const cat = ALL_COST_CATS.find(x => x.key === c.category)
                  const ctype = c.claim_type || 'none'
                  return (
                    <div key={c.id} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-3">
                      <span className="text-xl">{cat?.icon || '💵'}</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{cat?.label || c.category}</p>
                        <p className="text-[11px] text-slate-400">
                          {c.bank_name ? `🏦 ${c.bank_name} · ` : ''}垫付：{c.paid_by || '我自己'}
                          {ctype === 'customer' ? ' · 向客户 Claim' : ctype === 'payer' ? ' · 要还垫付人' : ''}
                        </p>
                        {c.note && <p className="text-xs text-slate-400">{c.note}</p>}
                      </div>
                      <span className="text-sm font-bold text-red-600">RM {Number(c.amount).toFixed(2)}</span>
                      {['super_admin', 'admin'].includes(currentUser.role) && (
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => setEditCost(c)} className="px-2 py-1 text-xs rounded-lg bg-white text-slate-600 hover:bg-slate-100 border border-slate-200">编辑</button>
                          <button onClick={async () => {
                            if (!window.confirm(`确定删除这笔费用？\n${cat?.label || c.category} RM ${Number(c.amount).toFixed(2)}\n（它的 Claim 收回记录也会一起删除）`)) return
                            const { error } = await supabase.from('case_costs').delete().eq('id', c.id)
                            if (error) { toast('删除失败：' + error.message, 'error'); return }
                            await logTimeline('删除费用', `${cat?.label || c.category} RM${Number(c.amount).toFixed(2)}`)
                            toast('已删除'); loadAll()
                          }} className="px-2 py-1 text-xs rounded-lg bg-red-50 text-red-500 hover:bg-red-100">删</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Documents ── */}
          {/* ── Payments ── */}
          {tab === 'payments' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-2xl p-5 text-white">
                <p className="text-xs text-slate-300 mb-3 uppercase tracking-wide">客户收款</p>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-black text-slate-100">RM {totalRevenue.toFixed(2)}</p>
                    <p className="text-xs text-slate-300">应收总额{hasServiceFee ? '' : '（银行收费加总）'}</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-green-400">RM {totalReceived.toFixed(2)}</p>
                    <p className="text-xs text-slate-300">已收</p>
                  </div>
                  <div>
                    <p className={`text-2xl font-black ${outstandingFee > 0.005 ? 'text-red-400' : 'text-green-300'}`}>RM {outstandingFee.toFixed(2)}</p>
                    <p className="text-xs text-slate-300">{outstandingFee > 0.005 ? '客户还欠' : outstandingFee < -0.005 ? '多收了' : '已收齐'}</p>
                  </div>
                </div>
              </div>
              {['super_admin', 'admin'].includes(currentUser.role) && (
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setShowAddPayment('payment')} className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold">+ 记录收款</button>
                  <button onClick={() => setShowAddPayment('refund')} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold">↩ 记录退款</button>
                  <button onClick={() => setShowFeeModal(true)} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold">✏️ 设置应收总额</button>
                </div>
              )}
              {payments.length === 0 && <p className="text-slate-400 text-sm text-center py-8">还没有收款记录</p>}
              <div className="space-y-2">
                {payments.map(p => (
                  <div key={p.id} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-3">
                    <span className="text-xl">{p.kind === 'refund' ? '↩️' : '💳'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{p.kind === 'refund' ? '退款' : '收款'}{p.payment_method ? ` · ${PAYMENT_METHODS[p.payment_method]?.label || p.payment_method}` : ''}</p>
                      <p className="text-xs text-slate-400">{fmt(p.payment_date)}{p.reference ? ` · ${p.reference}` : ''}{p.note ? ` · ${p.note}` : ''}</p>
                    </div>
                    <span className={`text-sm font-bold ${p.kind === 'refund' ? 'text-red-600' : 'text-green-600'}`}>{p.kind === 'refund' ? '-' : '+'}RM {Number(p.amount).toFixed(2)}</span>
                    {['super_admin', 'admin'].includes(currentUser.role) && (
                      <button onClick={async () => {
                        if (!window.confirm(`确定删除这笔${p.kind === 'refund' ? '退款' : '收款'} RM ${Number(p.amount).toFixed(2)}？`)) return
                        const { error } = await supabase.from('case_payments').delete().eq('id', p.id)
                        if (error) { toast('删除失败：' + error.message, 'error'); return }
                        await logTimeline('删除收款', `${p.kind === 'refund' ? '退款' : '收款'} RM${Number(p.amount).toFixed(2)}`)
                        toast('已删除'); loadAll()
                      }} className="px-2 py-1 text-xs rounded-lg bg-red-50 text-red-500 hover:bg-red-100">删</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'docs' && (
            <DocsTab files={files} ssmId={cas.ssm_id} ownerId={cas.owner_id} currentUser={currentUser} toast={toast} onReload={loadAll} />
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {showStatusChange && (
        <StatusChangeModal cas={cas} currentUser={currentUser}
          onClose={() => setShowStatusChange(false)}
          onSave={changeStatus} />
      )}
      {showBlockModal && (
        <BlockModal onClose={() => setShowBlockModal(false)} onSave={blockCase} />
      )}
      {showTerminateModal && (
        <TerminateModal depositAlreadyOut={depositAlreadyOut}
          onClose={() => setShowTerminateModal(false)} onSave={terminateCase} />
      )}
      {showUnterminateModal && (
        <UnterminateModal onClose={() => setShowUnterminateModal(false)} onSave={unterminateCase} />
      )}
      {showRecoveryModal && (
        <RecoveryModal cas={cas} outstandingDeposit={outstandingDeposit}
          onClose={() => setShowRecoveryModal(false)} onSave={updateRecovery} />
      )}
      {showAddTimeline && (
        <AddNoteModal onClose={() => setShowAddTimeline(false)}
          onSave={async (action, note) => {
            await logTimeline(action, note)
            setShowAddTimeline(false); loadAll(); toast('备注已添加')
          }} />
      )}
      {showEditProfile && (
        <EditProfileModal cas={cas} currentUser={currentUser} toast={toast}
          onClose={() => setShowEditProfile(false)}
          onSave={() => { setShowEditProfile(false); loadAll(); toast('资料已更新') }} />
      )}
      {showAddBank && (
        <BankFormModal initial={editBank} ssmId={cas.ssm_id} ownerId={cas.owner_id} currentUser={currentUser}
          onClose={() => { setShowAddBank(false); setEditBank(null) }}
          onSave={async () => {
            setShowAddBank(false); setEditBank(null); loadAll()
            await logTimeline(editBank ? '银行户口已更新' : '新增银行户口', editBank?.bank_name || '')
            toast(editBank ? '已更新' : '银行户口已新增')
          }} toast={toast} />
      )}
      {showAddDeposit && (
        <DepositFormModal initial={editDeposit} ssmId={cas.ssm_id} caseId={caseId} banks={banks} accounts={accounts} currentUser={currentUser}
          onClose={() => { setShowAddDeposit(false); setEditDeposit(null) }}
          onSave={async () => {
            setShowAddDeposit(false); setEditDeposit(null); loadAll()
            await logTimeline(editDeposit ? 'Deposit 记录已更新' : '新增 Deposit 记录', '')
            toast('已保存')
          }} toast={toast} />
      )}
      {showAddReturn && activeReturnDeposit && (
        <ReturnFormModal deposit={activeReturnDeposit} accounts={accounts}
          onClose={() => { setShowAddReturn(false); setActiveReturnDeposit(null) }}
          onSave={saveReturn} />
      )}
      {showAddCost && (
        <CostFormModal caseId={caseId} currentUser={currentUser} banks={banks}
          onClose={() => setShowAddCost(false)}
          onSave={async (cat, amount, note) => {
            setShowAddCost(false); loadAll()
            await logTimeline('新增费用', `${cat} RM${amount}${note ? ' - ' + note : ''}`)
            toast('费用已记录')
          }} />
      )}
      {showAddPayment && (
        <PaymentModal caseId={caseId} kind={showAddPayment} currentUser={currentUser} outstanding={outstandingFee} received={totalReceived}
          onClose={() => setShowAddPayment(null)}
          onSave={async (kind, amount) => {
            setShowAddPayment(null); loadAll()
            await logTimeline(kind === 'refund' ? '客户退款' : '收到客户付款', `RM${Number(amount).toFixed(2)}`)
            toast(kind === 'refund' ? '退款已记录' : '收款已记录')
          }} toast={toast} />
      )}
      {showFeeModal && (
        <ServiceFeeModal current={cas.service_fee} bankSum={totalBankCommission}
          onClose={() => setShowFeeModal(false)}
          onSave={async (val) => {
            const { error } = await supabase.from('cases').update({ service_fee: val }).eq('id', caseId)
            if (error) { toast('保存失败：' + error.message, 'error'); return }
            setShowFeeModal(false); loadAll(); toast('应收总额已更新')
          }} />
      )}
      {editCost && (
        <CostFormModal caseId={caseId} currentUser={currentUser} banks={banks} cost={editCost}
          onClose={() => setEditCost(null)}
          onSave={async (cat, amount, note) => {
            setEditCost(null); loadAll()
            await logTimeline('修改费用', `${cat} RM${amount}${note ? ' - ' + note : ''}`)
            toast('费用已更新')
          }} />
      )}
    </div>
  )
}

// ── Sub-modals ────────────────────────────────────────────────────────────────
function StatusChangeModal({ cas, onClose, onSave }) {
  const [status, setStatus] = useState(cas.status)
  const [note, setNote] = useState('')
  return (
    <Modal title="更新案件状态" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">新状态</label>
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
            {CASE_STATUSES.map(s => <option key={s} value={s}>{CASE_STATUS_ICONS[s]} {s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">备注（可选）</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="说明更新原因..."
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
        </div>
        <div className="flex gap-2 justify-end pt-3 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">取消</button>
          <button onClick={() => onSave(status, note)} className="px-5 py-2 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white">确认更新</button>
        </div>
      </div>
    </Modal>
  )
}

function BlockModal({ onClose, onSave }) {
  const [reason, setReason] = useState('')
  return (
    <Modal title="⚠️ 标记案件卡住" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-slate-500">案件会停留在目前阶段，只是加上警示标记，方便你知道要主动跟进什么。</p>
        <Field label="卡住原因 *">
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
            placeholder="例如：客户资料不全、等银行回复超过7天..."
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" />
        </Field>
        <div className="flex gap-2 justify-end pt-3 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">取消</button>
          <button onClick={() => reason && onSave(reason)} disabled={!reason}
            className="px-5 py-2 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50">确认标记</button>
        </div>
      </div>
    </Modal>
  )
}

function TerminateModal({ depositAlreadyOut, onClose, onSave }) {
  const [type, setType] = useState('rejected')
  const [reason, setReason] = useState('')
  return (
    <Modal title="🛑 终止案件" onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-600">
          此操作会把案件移出正常流程，标记为「被拒」或「撤回」。案件记录会保留，方便日后统计失败率，不会被删除。
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">终止类型</label>
          <div className="flex gap-2">
            {Object.entries(TERMINATION_TYPES).map(([key, t]) => (
              <button key={key} onClick={() => setType(key)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${type === key ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
        <Field label="原因 *">
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
            placeholder="例如：银行拒绝开户 / 客户中途放弃..."
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none" />
        </Field>
        {depositAlreadyOut && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
            💰 检测到此案件押金已经垫付出去，终止后会自动进入「押金追讨中」状态，之后请在案件页更新追讨结果。
          </div>
        )}
        <div className="flex gap-2 justify-end pt-3 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">取消</button>
          <button onClick={() => reason && onSave(type, reason, depositAlreadyOut)} disabled={!reason}
            className="px-5 py-2 rounded-xl text-sm font-bold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50">确认终止</button>
        </div>
      </div>
    </Modal>
  )
}

function UnterminateModal({ onClose, onSave }) {
  const [reason, setReason] = useState('')
  return (
    <Modal title="↩️ 撤销终止" onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
          此操作只有 Super Admin 能执行。案件会恢复到终止前的正常流程，之前的终止/追讨记录仍会保留在时间线里，不会消失。
        </div>
        <Field label="撤销原因 *">
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
            placeholder="例如：判断有误，客户其实没有放弃..."
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
        </Field>
        <div className="flex gap-2 justify-end pt-3 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">取消</button>
          <button onClick={() => reason && onSave(reason)} disabled={!reason}
            className="px-5 py-2 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50">确认撤销</button>
        </div>
      </div>
    </Modal>
  )
}

function RecoveryModal({ cas, outstandingDeposit, onClose, onSave }) {
  const [status, setStatus] = useState(cas.deposit_recovery_status || 'pending')
  const [target, setTarget] = useState(cas.deposit_recovery_target || 'agent')
  const [note, setNote] = useState(cas.deposit_recovery_note || '')
  return (
    <Modal title="💰 更新押金追讨结果" onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-slate-50 rounded-xl px-4 py-3">
          <p className="text-xs text-slate-400">未回押金金额</p>
          <p className="text-xl font-black text-slate-800">RM {Number(outstandingDeposit).toFixed(2)}</p>
        </div>
        <Field label="追讨对象">
          <Sel value={target} onChange={setTarget} options={Object.entries(DEPOSIT_RECOVERY_TARGETS).map(([v, l]) => ({ value: v, label: l }))} />
        </Field>
        <Field label="追讨结果">
          <Sel value={status} onChange={setStatus} options={Object.entries(DEPOSIT_RECOVERY_STATUSES).map(([v, s]) => ({ value: v, label: s.label }))} />
        </Field>
        {status === 'company_absorbed' && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-600">
            选择「公司吸收」会自动在此案件的费用明细里新增一笔 RM {Number(outstandingDeposit).toFixed(2)} 的亏损记录。
          </div>
        )}
        <Field label="备注"><Inp value={note} onChange={setNote} placeholder="说明追讨过程..." /></Field>
        <div className="flex gap-2 justify-end pt-3 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">取消</button>
          <button onClick={() => onSave(status, target, note)}
            className="px-5 py-2 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white">保存</button>
        </div>
      </div>
    </Modal>
  )
}

function AddNoteModal({ onClose, onSave }) {
  const [action, setAction] = useState('')
  const [note, setNote] = useState('')
  return (
    <Modal title="添加备注" onClose={onClose}>
      <div className="space-y-3">
        <Field label="标题 *"><Inp value={action} onChange={setAction} placeholder="e.g. 客户已确认" /></Field>
        <Field label="详情" span2>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="详细说明..."
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
        </Field>
        <div className="flex gap-2 justify-end pt-3 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">取消</button>
          <button onClick={() => action && onSave(action, note)} disabled={!action} className="px-5 py-2 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50">添加</button>
        </div>
      </div>
    </Modal>
  )
}

function EditProfileModal({ cas, onClose, onSave, toast }) {
  const [ownerForm, setOwnerForm] = useState({ ...cas.owners })
  const emptySSM = { ssm_name: '', reg_no: '', reg_date: '', exp_date: '', address: '', ezbiz_user_id: '', ezbiz_password: '', fee_ssm: 0, fee_contract: 0, fee_chop: 0 }
  const [ssmForm, setSsmForm] = useState(cas.ssm_id ? { ...cas.ssm } : emptySSM)
  const [loading, setLoading] = useState(false)
  const setO = (k, v) => setOwnerForm(p => ({ ...p, [k]: v }))
  const setS = (k, v) => setSsmForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    setLoading(true)
    await supabase.from('owners').update({ ...ownerForm, updated_at: new Date() }).eq('id', cas.owner_id)
    if (cas.ssm_id) {
      // 已经有 SSM 记录，直接更新
      await supabase.from('ssm').update({ ...ssmForm, updated_at: new Date() }).eq('id', cas.ssm_id)
    } else if (ssmForm.ssm_name) {
      // 还没有 SSM 记录，而且这次有填公司名称 → 新建一笔，并且关联回这个案件
      const { data: newSsm, error: ssmErr } = await supabase.from('ssm').insert({
        ...ssmForm, owner_id: cas.owner_id, agent_id: cas.agent_id, status: 'New', updated_at: new Date(),
      }).select().single()
      if (ssmErr) { toast && toast('SSM 建立失败：' + ssmErr.message, 'error'); setLoading(false); return }
      await supabase.from('cases').update({ ssm_id: newSsm.id, updated_at: new Date() }).eq('id', cas.id)
    }
    setLoading(false); onSave()
  }

  return (
    <Modal title="编辑资料" onClose={onClose} wide>
      <div className="space-y-5">
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">👤 Owner</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="姓名" span2><Inp value={ownerForm.name} onChange={v => setO('name', v)} /></Field>
            <Field label="IC No."><Inp value={ownerForm.ic} onChange={v => setO('ic', v)} /></Field>
            <Field label="母亲姓名"><Inp value={ownerForm.mother_name} onChange={v => setO('mother_name', v)} /></Field>
            <Field label="电话"><Inp value={ownerForm.phone} onChange={v => setO('phone', v)} /></Field>
            <Field label="Email"><Inp value={ownerForm.email} onChange={v => setO('email', v)} /></Field>
            <Field label="地址" span2><Inp value={ownerForm.address} onChange={v => setO('address', v)} /></Field>
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">🏢 SSM</p>
          {!cas.ssm_id && (
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-2.5 mb-3 text-xs text-amber-700">
              ⚠️ 这个案件还没有 SSM 记录。填写「公司名称」并保存，会自动新建 SSM 资料并关联到这个案件——建立后，银行户口、押金、文件这几个功能才能正常使用。
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="公司名称" span2><Inp value={ssmForm.ssm_name} onChange={v => setS('ssm_name', v)} /></Field>
            <Field label="注册号"><Inp value={ssmForm.reg_no} onChange={v => setS('reg_no', v)} /></Field>
            <Field label="注册日期"><Inp type="date" value={ssmForm.reg_date} onChange={v => setS('reg_date', v)} /></Field>
            <Field label="到期日期"><Inp type="date" value={ssmForm.exp_date} onChange={v => setS('exp_date', v)} /></Field>
            <Field label="地址" span2><Inp value={ssmForm.address} onChange={v => setS('address', v)} /></Field>
            <Field label="EZBIZ User ID"><Inp value={ssmForm.ezbiz_user_id} onChange={v => setS('ezbiz_user_id', v)} /></Field>
            <Field label="EZBIZ Password"><Inp value={ssmForm.ezbiz_password} onChange={v => setS('ezbiz_password', v)} /></Field>
            <Field label="SSM 注册费 (RM)"><Inp type="number" value={ssmForm.fee_ssm} onChange={v => setS('fee_ssm', v)} /></Field>
            <Field label="合同费 (RM)"><Inp type="number" value={ssmForm.fee_contract} onChange={v => setS('fee_contract', v)} /></Field>
            <Field label="做 Chop 费 (RM)"><Inp type="number" value={ssmForm.fee_chop} onChange={v => setS('fee_chop', v)} /></Field>
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">取消</button>
          <button onClick={handleSave} disabled={loading} className="px-5 py-2 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50">{loading ? '保存中...' : '保存'}</button>
        </div>
      </div>
    </Modal>
  )
}

function BankFormModal({ initial, ssmId, ownerId, currentUser, onClose, onSave, toast }) {
  const empty = { bank_name: 'RHB', account_no: '', bank_email: '', com_id: '', open_date: '', handover_date: '', branch: '', status: 'New', ob_user_id: '', ob_password: '', corp_id: '', secure_plus_serial: '', login_id: '', access_id: '', access_number: '', temp_password: '', organisation_id: '', atm_card_no: '', atm_pin: '', tac_phone: '', commission: 0, fee_deposit: 0, fee_bank_charge: 0, fee_card: 0, fee_simcard: 0, fee_forex: 0, fee_others: 0, security_qa: [{ q: '', a: '' }] }
  const [form, setForm] = useState(initial ? { ...initial, security_qa: initial.security_qa?.filter(q => q.q) || [{ q: '', a: '' }] } : empty)
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const setQa = (i, field, v) => { const qa = [...form.security_qa]; qa[i] = { ...qa[i], [field]: v }; set('security_qa', qa) }
  const addQa = () => form.security_qa.length < 5 && set('security_qa', [...form.security_qa, { q: '', a: '' }])
  const removeQa = i => { const qa = form.security_qa.filter((_, idx) => idx !== i); set('security_qa', qa.length ? qa : [{ q: '', a: '' }]) }
  const totalFees = (Number(form.fee_deposit) || 0) + (Number(form.fee_bank_charge) || 0) + (Number(form.fee_card) || 0) + (Number(form.fee_simcard) || 0) + (Number(form.fee_forex) || 0) + (Number(form.fee_others) || 0)
  const netCommission = (Number(form.commission) || 0) - totalFees

  const [generatingComId, setGeneratingComId] = useState(false)
  const generateComId = async () => {
    if (!form.handover_date) { toast('请先填交接日期', 'error'); return }
    setGeneratingComId(true)
    const [y, m, d] = form.handover_date.split('-')
    const datePart = `${d}${m}${y.slice(2)}` // DDMMYY
    // 查同一天已经有几笔交接（编辑时要排除自己这一笔，不然会多算一次）
    let query = supabase.from('bank_accounts').select('id', { count: 'exact', head: true }).eq('handover_date', form.handover_date)
    if (initial?.id) query = query.neq('id', initial.id)
    const { count, error } = await query
    setGeneratingComId(false)
    if (error) { toast('生成失败：' + error.message, 'error'); return }
    const seq = String((count || 0) + 1).padStart(3, '0')
    set('com_id', `COM-${datePart}-${seq}`)
  }

  // 填了交接日期、COM ID 还是空的，就自动生成（保存时数据库也会再保证一次）
  const autoComId = async (date) => {
    const [y, m, d] = date.split('-')
    let q = supabase.from('bank_accounts').select('com_id').like('com_id', `COM-${d}${m}${y.slice(2)}-%`)
    if (initial?.id) q = q.neq('id', initial.id)
    const { data } = await q
    const max = Math.max(0, ...(data || []).map(r => parseInt((r.com_id || '').split('-').pop(), 10) || 0))
    set('com_id', `COM-${d}${m}${y.slice(2)}-${String(max + 1).padStart(3, '0')}`)
  }

  const handleSave = async () => {
    if (!form.bank_name) { toast('请选择银行', 'error'); return }
    if (!ssmId) {
      toast('这个案件还没有关联的 SSM 记录，银行户口无法正确关联，请先完善案件的公司资料', 'error')
      return
    }
    setLoading(true)
    const cleanedQa = form.security_qa.filter(q => q.q || q.a)
    // COM ID 没填的话要存成 null，不能存空字串 ''——因为数据库设定了「COM ID 不能重复」，
    // 如果好几笔都存空字串，会被当成「都一样、重复了」而保存失败
    const payload = { ...form, com_id: form.com_id || null, security_qa: cleanedQa, ssm_id: ssmId, owner_id: ownerId, updated_at: new Date() }
    let saveError = null
    if (initial) {
      const { error } = await supabase.from('bank_accounts').update(payload).eq('id', initial.id)
      saveError = error
    } else {
      const { error } = await supabase.from('bank_accounts').insert(payload)
      saveError = error
    }
    setLoading(false)
    if (saveError) {
      if (saveError.message.includes('bank_accounts_com_id_key')) {
        toast('保存失败：这个 COM ID 已经被别的银行户口用过了，请换一个', 'error')
      } else {
        toast('保存失败：' + saveError.message, 'error')
      }
      return
    }
    onSave()
  }

  return (
    <Modal title={initial ? '编辑银行户口' : '新增银行户口'} onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-3">
        <Field label="银行"><Sel value={form.bank_name} onChange={v => set('bank_name', v)} options={[...BANKS, ...['BSN', 'AmBank'].filter(b => !BANKS.includes(b))]} /></Field>
        <Field label="状态"><Sel value={form.status} onChange={v => set('status', v)} options={BANK_STATUSES.filter(s => s !== 'Blacklist' || ['super_admin', 'admin'].includes(currentUser.role))} /></Field>
        <Field label="账号"><Inp value={form.account_no} onChange={v => set('account_no', v)} /></Field>
        <Field label="分行"><Inp value={form.branch} onChange={v => set('branch', v)} /></Field>
        <Field label="银行 Email"><Inp type="email" value={form.bank_email} onChange={v => set('bank_email', v)} /></Field>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">COM ID</label>
          <div className="flex gap-2">
            <Inp value={form.com_id} onChange={v => set('com_id', v)} placeholder="COM-DDMMYY-序号" />
            <button type="button" onClick={generateComId} disabled={generatingComId}
              className="px-3 py-2 rounded-lg bg-teal-50 text-teal-700 text-xs font-medium hover:bg-teal-100 whitespace-nowrap disabled:opacity-50">
              {generatingComId ? '生成中...' : '🔄 自动生成'}
            </button>
          </div>
        </div>
        <Field label="开户日期"><Inp type="date" value={form.open_date} onChange={v => set('open_date', v)} /></Field>
        <Field label="交接日期"><Inp type="date" value={form.handover_date} onChange={v => { set('handover_date', v); if (v && !form.com_id) autoComId(v) }} /></Field>
        <Field label="收费 (RM)"><Inp type="number" value={form.commission} onChange={v => set('commission', v)} /></Field>
        <Field label="OB 用户名"><Inp value={form.ob_user_id} onChange={v => set('ob_user_id', v)} /></Field>
        <Field label="OB 密码"><Inp value={form.ob_password} onChange={v => set('ob_password', v)} /></Field>
        {form.bank_name === 'RHB' && <><Field label="Corporate ID"><Inp value={form.corp_id} onChange={v => set('corp_id', v)} /></Field><Field label="Secure Plus Serial"><Inp value={form.secure_plus_serial} onChange={v => set('secure_plus_serial', v)} /></Field></>}
        {form.bank_name === 'Maybank' && <><Field label="Login ID"><Inp value={form.login_id} onChange={v => set('login_id', v)} /></Field><Field label="Access ID"><Inp value={form.access_id} onChange={v => set('access_id', v)} /></Field><Field label="Access Number"><Inp value={form.access_number} onChange={v => set('access_number', v)} /></Field></>}
        {form.bank_name === 'OCBC' && <Field label="Organisation ID"><Inp value={form.organisation_id} onChange={v => set('organisation_id', v)} /></Field>}
        {form.bank_name === 'Affin' && <><Field label="Corporate ID"><Inp value={form.corp_id} onChange={v => set('corp_id', v)} /></Field><Field label="Temporary Password"><Inp value={form.temp_password} onChange={v => set('temp_password', v)} /></Field></>}
        <Field label="ATM 卡号"><Inp value={form.atm_card_no} onChange={v => set('atm_card_no', v)} /></Field>
        <Field label="ATM PIN"><Inp value={form.atm_pin} onChange={v => set('atm_pin', v)} /></Field>
        <Field label="TAC Phone"><Inp value={form.tac_phone} onChange={v => set('tac_phone', v)} /></Field>
        {/* Security QA */}
        <div className="col-span-2 bg-slate-50 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-600">🔒 安全问题</p>
            {form.security_qa.length < 5 && <button onClick={addQa} className="text-xs text-teal-600 hover:text-teal-800">+ 新增</button>}
          </div>
          {form.security_qa.map((qa, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 items-end">
              <Field label={`问题 ${i + 1}`}><Inp value={qa.q} onChange={v => setQa(i, 'q', v)} /></Field>
              <div className="flex gap-1 items-end">
                <div className="flex-1"><Field label={`答案 ${i + 1}`}><Inp value={qa.a} onChange={v => setQa(i, 'a', v)} /></Field></div>
                {form.security_qa.length > 1 && <button onClick={() => removeQa(i)} className="px-2 py-2 text-xs rounded-lg bg-red-50 text-red-500 mb-0.5">✕</button>}
              </div>
            </div>
          ))}
        </div>
        {/* Fees：费用统一在「费用」页 / 案件费用 Tab 记录；旧资料有填过才显示这一块，避免重复输入 */}
        {totalFees === 0 && (
          <div className="col-span-2 bg-slate-50 rounded-xl px-3 py-2 text-xs text-slate-500">
            💡 Bank Charge、电话卡等成本不用在这里填，请到案件的「💵 费用」页记录一次，全站自动同步。
          </div>
        )}
        {totalFees > 0 && <div className="col-span-2 bg-amber-50 rounded-xl p-3 space-y-2">
          <p className="text-xs font-bold text-amber-700">💰 银行费用（旧资料，新费用请到「费用」页记）</p>
          <div className="grid grid-cols-3 gap-2">
            {[['Deposit', 'fee_deposit'], ['Bank Charge', 'fee_bank_charge'], ['Card 费', 'fee_card'], ['电话卡', 'fee_simcard'], ['外汇 Charge', 'fee_forex'], ['其他', 'fee_others']].map(([label, key]) => (
              <Field key={key} label={`${label} (RM)`}><Inp type="number" value={form[key]} onChange={v => set(key, v)} /></Field>
            ))}
          </div>
          <div className="flex justify-between pt-2 border-t border-amber-100 text-xs">
            <span className="text-amber-600">总费用：<strong>RM {totalFees.toFixed(2)}</strong></span>
            <span className={netCommission >= 0 ? 'text-green-600' : 'text-red-600'}>净佣金：<strong>RM {netCommission.toFixed(2)}</strong></span>
          </div>
        </div>}
        <div className="col-span-2 flex gap-2 justify-end pt-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">取消</button>
          <button onClick={handleSave} disabled={loading} className="px-5 py-2 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50">{loading ? '保存中...' : '保存'}</button>
        </div>
      </div>
    </Modal>
  )
}

function DepositFormModal({ initial, ssmId, caseId, banks, accounts, currentUser, onClose, onSave, toast }) {
  // initial 是从数据库查回来的，会带着 bank_accounts / company_accounts 这些「关联查询」对象
  // 不是真正的欄位，保存时如果整个塞进去，数据库会直接拒绝（找不到这个欄位）
  const cleanInitial = initial ? (() => {
    const { bank_accounts, company_accounts, ...rest } = initial
    return rest
  })() : null
  const [form, setForm] = useState(cleanInitial || { bank_account_id: banks[0]?.id || '', account_id: '', payment_method: 'transfer', amount: 0, depositor: '', bank_charge: 0, transfer_to: '', transfer_to_account: '', transfer_date: '', transfer_amount: null, notes: '' })
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const autoTransferAmount = (Number(form.amount) || 0) - (Number(form.bank_charge) || 0)
  // 转出金额预设自动算，但可以手动覆写（比如打错了要修正）；有手动填过就用手动的，没填就用自动算的
  const transferAmount = form.transfer_amount !== null && form.transfer_amount !== undefined && form.transfer_amount !== '' ? Number(form.transfer_amount) : autoTransferAmount

  const handleSave = async () => {
    if (!form.amount) { toast('请填写金额', 'error'); return }
    setLoading(true)
    // 只送真正存在于 deposits 表的欄位，避免把关联对象或不相干的东西一起送进去
    const payload = {
      bank_account_id: form.bank_account_id, account_id: form.account_id, payment_method: form.payment_method,
      amount: Number(form.amount) || 0, depositor: form.depositor, bank_charge: Number(form.bank_charge) || 0,
      transfer_to: form.transfer_to, transfer_to_account: form.transfer_to_account, transfer_date: form.transfer_date || null,
      transfer_amount: transferAmount, notes: form.notes, ssm_id: ssmId, updated_at: new Date(),
    }

    let saveError = null
    if (initial) {
      const { error } = await supabase.from('deposits').update(payload).eq('id', initial.id)
      saveError = error
    } else {
      const { error } = await supabase.from('deposits').insert({ ...payload, created_by: currentUser.id, status: 'pending', returned_amount: 0 })
      saveError = error
    }

    if (saveError) {
      toast('保存失败：' + saveError.message, 'error')
      setLoading(false)
      return // 保存失败就不要往下扣款，避免钱扣了但记录没存到的对不上账问题
    }

    // 情况一：新增 Deposit，有选公司账户 → 直接扣款
    if (form.account_id && !initial) {
      const acc = accounts.find(a => a.id === form.account_id)
      if (acc) {
        await supabase.from('company_accounts').update({
          balance: (Number(acc.balance) || 0) - (Number(form.amount) || 0), updated_at: new Date(),
        }).eq('id', form.account_id)
        await supabase.from('account_transactions').insert({
          account_id: form.account_id, bank_account_id: form.bank_account_id, case_id: caseId,
          type: 'deposit_out', amount: Number(form.amount) || 0, payment_method: form.payment_method,
          reference: `Deposit - ${form.transfer_to || ''}`, date: form.transfer_date || new Date(),
          note: form.notes || '', created_by: currentUser.id,
        })
      }
    }

    // 情况二：编辑既有 Deposit，如果换了公司账户或改了金额，财务要跟着同步，不能只改记录不改账
    // 用「撤销旧扣款 + 套用新扣款」的方式处理，两笔都留下流水记录，方便日后追查（不像之前那样悄悄漏掉）
    if (initial) {
      const oldAccountId = initial.account_id || null
      const oldAmount = Number(initial.amount) || 0
      const newAccountId = form.account_id || null
      const newAmount = Number(form.amount) || 0
      if (oldAccountId !== newAccountId || oldAmount !== newAmount) {
        if (oldAccountId) {
          const { data: oldAcc } = await supabase.from('company_accounts').select('balance').eq('id', oldAccountId).single()
          if (oldAcc) {
            await supabase.from('company_accounts').update({ balance: Number(oldAcc.balance) + oldAmount, updated_at: new Date() }).eq('id', oldAccountId)
            await supabase.from('account_transactions').insert({
              account_id: oldAccountId, bank_account_id: initial.bank_account_id, case_id: caseId,
              type: 'adjustment_in', amount: oldAmount, payment_method: initial.payment_method,
              reference: 'Deposit 编辑修正', date: new Date(), note: '编辑 Deposit 时撤销原本的扣款', created_by: currentUser.id,
            })
          }
        }
        if (newAccountId) {
          const { data: newAcc } = await supabase.from('company_accounts').select('balance').eq('id', newAccountId).single()
          if (newAcc) {
            await supabase.from('company_accounts').update({ balance: Number(newAcc.balance) - newAmount, updated_at: new Date() }).eq('id', newAccountId)
            await supabase.from('account_transactions').insert({
              account_id: newAccountId, bank_account_id: form.bank_account_id, case_id: caseId,
              type: 'deposit_out', amount: newAmount, payment_method: form.payment_method,
              reference: `Deposit 编辑修正 - ${form.transfer_to || ''}`, date: form.transfer_date || new Date(),
              note: '编辑 Deposit 后重新套用扣款', created_by: currentUser.id,
            })
          }
        }
      }
    }
    setLoading(false); onSave()
  }

  return (
    <Modal title={initial ? '编辑 Deposit' : '新增 Deposit 记录'} onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-3">
        <Field label="转进哪个银行户口 *" span2>
          <select value={form.bank_account_id} onChange={e => set('bank_account_id', e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
            <option value="">-- 选择银行户口 --</option>
            {banks.map(b => <option key={b.id} value={b.id}>{b.bank_name} — {b.account_no || '未填账号'}</option>)}
          </select>
        </Field>
        <Field label="从哪个公司账户">
          <Sel value={form.account_id} onChange={v => set('account_id', v)} options={accounts.map(a => ({ value: a.id, label: `${a.name} (RM ${Number(a.balance).toFixed(2)})` }))} />
        </Field>
        <Field label="付款方式">
          <div className="flex gap-2">
            {Object.entries(PAYMENT_METHODS).map(([k, m]) => (
              <button key={k} type="button" onClick={() => set('payment_method', k)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${form.payment_method === k ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                {m.icon} {m.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Deposit 金额 (RM) *"><Inp type="number" value={form.amount} onChange={v => set('amount', v)} /></Field>
        <Field label="谁存的"><Inp value={form.depositor} onChange={v => set('depositor', v)} placeholder="存款人" /></Field>
        <Field label="Bank Charge (RM)"><Inp type="number" value={form.bank_charge} onChange={v => set('bank_charge', v)} /></Field>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">转出金额（可修改，预设自动算）</label>
          <Inp type="number" value={transferAmount} onChange={v => set('transfer_amount', v)}
            className={transferAmount >= 0 ? 'border-green-200 text-green-700 font-bold' : 'border-red-200 text-red-600 font-bold'} />
          {form.transfer_amount !== null && form.transfer_amount !== undefined && form.transfer_amount !== '' && Number(form.transfer_amount) !== autoTransferAmount && (
            <button type="button" onClick={() => set('transfer_amount', null)} className="text-[10px] text-teal-600 hover:text-teal-800 mt-1">↺ 已手动修改，点这里恢复自动计算 (RM {autoTransferAmount.toFixed(2)})</button>
          )}
        </div>
        <Field label="转给谁"><Inp value={form.transfer_to} onChange={v => set('transfer_to', v)} /></Field>
        <Field label="收款账号"><Inp value={form.transfer_to_account} onChange={v => set('transfer_to_account', v)} /></Field>
        <Field label="转出日期"><Inp type="date" value={form.transfer_date} onChange={v => set('transfer_date', v)} /></Field>
        <Field label="备注" span2><Inp value={form.notes} onChange={v => set('notes', v)} /></Field>
        {!initial && (
          <p className="col-span-2 text-xs text-slate-400 -mt-1">💡 回款请先保存这笔 Deposit，再到列表里用「+ 添加回款」记录，一笔押金可以分好几次、不同账户、不同方式回来。</p>
        )}
        <div className="col-span-2 flex gap-2 justify-end pt-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">取消</button>
          <button onClick={handleSave} disabled={loading} className="px-5 py-2 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50">{loading ? '保存中...' : '保存'}</button>
        </div>
      </div>
    </Modal>
  )
}

function ReturnFormModal({ deposit, accounts, onClose, onSave }) {
  const [accountId, setAccountId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('transfer')
  const [amount, setAmount] = useState(0)
  const [returnDate, setReturnDate] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await onSave(deposit.id, { account_id: accountId, payment_method: paymentMethod, amount, return_date: returnDate, note })
    setSaving(false)
  }

  return (
    <Modal title="💰 添加回款记录" onClose={onClose}>
      <div className="space-y-3">
        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-3 text-xs text-slate-500">
          这笔 Deposit 净额 RM {((deposit.transfer_amount !== null && deposit.transfer_amount !== undefined) ? Number(deposit.transfer_amount) : (Number(deposit.amount) || 0) - (Number(deposit.bank_charge) || 0)).toFixed(2)}，可以分好几次、不同账户、不同方式陆续记录回款。
        </div>
        <Field label="回到哪个公司账户 *">
          <Sel value={accountId} onChange={setAccountId} options={accounts.map(a => ({ value: a.id, label: `${a.name} (RM ${Number(a.balance).toFixed(2)})` }))} />
        </Field>
        <Field label="付款方式">
          <div className="flex gap-2">
            {Object.entries(PAYMENT_METHODS).map(([k, m]) => (
              <button key={k} type="button" onClick={() => setPaymentMethod(k)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${paymentMethod === k ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                {m.icon} {m.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="回款金额 (RM) *"><Inp type="number" value={amount} onChange={setAmount} /></Field>
        <Field label="回款日期"><Inp type="date" value={returnDate} onChange={setReturnDate} /></Field>
        <Field label="备注"><Inp value={note} onChange={setNote} placeholder="（可选）" /></Field>
        <div className="flex gap-2 justify-end pt-3 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">取消</button>
          <button onClick={handleSave} disabled={saving || !amount || !accountId}
            className="px-5 py-2 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50">{saving ? '保存中...' : '保存'}</button>
        </div>
      </div>
    </Modal>
  )
}

function PaymentModal({ caseId, kind, currentUser, outstanding, received, onClose, onSave, toast }) {
  const [amount, setAmount] = useState(kind === 'payment' && outstanding > 0 ? String(outstanding) : '')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState('transfer')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    const a = Number(amount)
    if (!(a > 0)) { toast('请填金额', 'error'); return }
    if (kind === 'refund' && a > received + 0.005 && !window.confirm(`退款 RM ${a.toFixed(2)} 比已收的 RM ${received.toFixed(2)} 还多，确定吗？`)) return
    setBusy(true)
    const { error } = await supabase.from('case_payments').insert({ case_id: caseId, kind, amount: a, payment_date: date || null, payment_method: method, reference: reference || null, note: note || null, created_by: currentUser.id })
    setBusy(false)
    if (error) { toast('保存失败：' + error.message, 'error'); return }
    onSave(kind, a)
  }
  return (
    <Modal title={kind === 'refund' ? '记录退款' : '记录客户收款'} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="金额 (RM) *"><Inp type="number" value={amount} onChange={setAmount} /></Field>
        <Field label="日期"><Inp type="date" value={date} onChange={setDate} /></Field>
        <Field label="付款方式"><Sel value={method} onChange={setMethod} options={Object.entries(PAYMENT_METHODS).map(([value, m]) => ({ value, label: `${m.icon} ${m.label}` }))} /></Field>
        <Field label="单号 / 参考"><Inp value={reference} onChange={setReference} placeholder="（可选）" /></Field>
        <Field label="备注" span2><Inp value={note} onChange={setNote} placeholder="（可选）" /></Field>
      </div>
      <div className="flex gap-2 justify-end pt-4 mt-4 border-t border-slate-200">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">取消</button>
        <button onClick={save} disabled={busy} className="px-5 py-2 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50">{busy ? '保存中...' : '保存'}</button>
      </div>
    </Modal>
  )
}

function ServiceFeeModal({ current, bankSum, onClose, onSave }) {
  const [val, setVal] = useState(current === null || current === undefined ? '' : String(current))
  return (
    <Modal title="设置应收总额" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-slate-500">这个案件要向客户收的服务费总额。留空 = 自动用各银行户口的「收费」加总（现在是 RM {Number(bankSum).toFixed(2)}）。</p>
        <Field label="应收总额 (RM)"><Inp type="number" value={val} onChange={setVal} placeholder={String(bankSum)} /></Field>
        <div className="flex gap-2 justify-end pt-3 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">取消</button>
          <button onClick={() => onSave(val === '' ? null : Number(val))} className="px-5 py-2 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white">保存</button>
        </div>
      </div>
    </Modal>
  )
}

const EXTRA_COST_CATS = [{ key: 'lease', label: '租约', icon: '🏠' }, { key: 'license', label: '营业执照', icon: '📄' }, { key: 'transport', label: '交通', icon: '🚗' }]
const ALL_COST_CATS = [...COST_CATEGORIES, ...EXTRA_COST_CATS.filter(e => !COST_CATEGORIES.some(c => c.key === e.key))]
const CLAIM_TYPE_OPTIONS = [
  { value: 'none', label: '不需要 Claim' },
  { value: 'customer', label: '向客户 Claim（客户要还我）' },
  { value: 'payer', label: '要还给垫付的人（我要还别人）' },
]

function CostFormModal({ caseId, currentUser, banks = [], cost = null, onClose, onSave }) {
  const isEdit = !!cost
  const [bankName, setBankName] = useState(cost?.bank_name || '')
  const [paidBy, setPaidBy] = useState(cost?.paid_by || '我自己')
  const [claimType, setClaimType] = useState(cost?.claim_type || 'none')
  const [claimAmount, setClaimAmount] = useState(cost?.claim_amount ?? '')
  const [category, setCategory] = useState(cost?.category || 'ssm_fee')
  const [amount, setAmount] = useState(cost?.amount ?? 0)
  const [transferAmt, setTransferAmt] = useState(cost && cost.payment_method === 'split' ? (cost.transfer_amount || 0) : (cost?.payment_method === 'cash' ? 0 : 0))
  const [cashAmt, setCashAmt] = useState(cost && cost.payment_method === 'split' ? (cost.cash_amount || 0) : (cost?.payment_method === 'cash' ? (cost.amount || 0) : 0))
  const [note, setNote] = useState(cost?.note || '')
  const [loading, setLoading] = useState(false)
  const splitTotal = (Number(transferAmt) || 0) + (Number(cashAmt) || 0)
  const splitMismatch = Number(amount) > 0 && splitTotal > 0 && Math.abs(splitTotal - Number(amount)) > 0.005

  const handleSave = async () => {
    if (!amount) return
    if (splitMismatch) return
    setLoading(true)
    const noSplit = splitTotal === 0
    const paymentMethod = noSplit ? 'transfer' : Number(cashAmt) > 0 && Number(transferAmt) > 0 ? 'split' : Number(cashAmt) > 0 ? 'cash' : 'transfer'
    const payload = {
      case_id: caseId, category, amount: Number(amount),
      payment_method: paymentMethod, transfer_amount: noSplit ? Number(amount) : (Number(transferAmt) || 0), cash_amount: noSplit ? 0 : (Number(cashAmt) || 0),
      bank_name: bankName || null, paid_by: paidBy || '我自己', cost_date: new Date().toISOString().slice(0, 10),
      claim_type: claimType, claim_amount: claimType === 'none' ? null : (claimAmount === '' ? Number(amount) : Number(claimAmount)),
      note,
    }
    if (isEdit) {
      delete payload.cost_date
      const { error } = await supabase.from('case_costs').update(payload).eq('id', cost.id)
      if (error) { setLoading(false); alert('保存失败：' + error.message); return }
    } else {
      await supabase.from('case_costs').insert({ ...payload, created_by: currentUser.id })
    }
    const cat = ALL_COST_CATS.find(c => c.key === category)
    setLoading(false); onSave(cat?.label || category, amount, note)
  }

  return (
    <Modal title={isEdit ? "编辑费用记录" : "新增费用记录"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="费用类别">
          <Sel value={category} onChange={setCategory} options={ALL_COST_CATS.map(c => ({ value: c.key, label: `${c.icon} ${c.label}` }))} />
        </Field>
        <Field label="相关银行（银行费用才选）">
          <Sel value={bankName} onChange={setBankName} options={[...new Set([...banks.map(b => b.bank_name), 'RHB', 'Affin', 'Hong Leong', 'CIMB', 'BSN', 'Bank Muamalat', 'Maybank', 'AmBank', 'OCBC'])]} />
        </Field>
        <Field label="金额 (RM) *"><Inp type="number" value={amount} onChange={setAmount} /></Field>
        <Field label="谁先垫付"><PayerSelect value={paidBy} onChange={setPaidBy} /></Field>
        <Field label="Claim 类型"><Sel value={claimType} onChange={setClaimType} options={CLAIM_TYPE_OPTIONS} /></Field>
        {claimType !== 'none' && <Field label="Claim 金额（不填 = 全额）"><Inp type="number" value={claimAmount} onChange={setClaimAmount} placeholder={String(amount || '')} /></Field>}
        <Field label="付款方式（不填 = 全部转账；要拆分才填）">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">🏦 转账金额 (RM)</label>
              <Inp type="number" value={transferAmt} onChange={setTransferAmt} />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">💵 现金金额 (RM)</label>
              <Inp type="number" value={cashAmt} onChange={setCashAmt} />
            </div>
          </div>
          {amount > 0 && (
            <p className={`text-xs mt-1.5 ${splitMismatch ? 'text-red-500' : 'text-slate-400'}`}>
              转账 + 现金 = RM {splitTotal.toFixed(2)}
              {splitMismatch ? `　⚠️ 跟金额 (RM ${Number(amount).toFixed(2)}) 对不上` : '　✓ 一致'}
            </p>
          )}
        </Field>
        <Field label="备注"><Inp value={note} onChange={setNote} placeholder="（可选）" /></Field>
        <div className="flex gap-2 justify-end pt-3 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">取消</button>
          <button onClick={handleSave} disabled={loading || !amount || splitMismatch} className="px-5 py-2 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50">{loading ? '保存中...' : '保存'}</button>
        </div>
      </div>
    </Modal>
  )
}

function DocsTab({ files, ssmId, ownerId, currentUser, toast, onReload }) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState(null)

  const handleUpload = async (cat, e) => {
    const file = e.target.files[0]; if (!file) return
    if (!ssmId) {
      toast('这个案件还没有 SSM 资料，文件暂时无法上传——请先到「资料」Tab 补上 SSM 资料，再回来上传', 'error')
      e.target.value = ''
      return
    }
    if (file.size > 10 * 1024 * 1024) { toast('文件不能超过10MB', 'error'); return }
    setUploading(true)
    try {
      if (cat === 'IC (Owner)') {
        // IC 存进私有桶，只有登录后才看得到
        const path = await uploadIcFile(file, ownerId)
        await supabase.from('files').insert({ ssm_id: ssmId, owner_id: ownerId, category: cat, file_name: file.name, bucket: 'owner-ic', storage_path: path, file_url: null, uploaded_by: currentUser.id })
      } else if (cat === 'ATM Card Photo') {
        const path = await uploadPrivateFile(file, ssmId, 'ATM')
        await supabase.from('files').insert({ ssm_id: ssmId, owner_id: ownerId, category: cat, file_name: file.name, bucket: 'private-files', storage_path: path, file_url: null, uploaded_by: currentUser.id })
      } else {
        const ext = file.name.split('.').pop()
        const path = `${ssmId}/${Date.now()}_${cat.replace(/\s/g, '_')}.${ext}`
        const { error: upErr } = await supabase.storage.from('ssm-files').upload(path, file)
        if (upErr) throw upErr
        const { data: { publicUrl } } = supabase.storage.from('ssm-files').getPublicUrl(path)
        await supabase.from('files').insert({ ssm_id: ssmId, owner_id: ownerId, category: cat, file_name: file.name, file_url: publicUrl, uploaded_by: currentUser.id })
      }
      toast('上传成功'); onReload()
    } catch (err) { toast('上传失败: ' + err.message, 'error') }
    setUploading(false); e.target.value = ''
  }

  const openPreview = async (f) => {
    try { setPreview({ ...f, url: await getFileUrl(f) }) } catch (e) { toast('无法打开文件：' + e.message, 'error') }
  }
  const downloadFile = async (f) => {
    try {
      const url = await getFileUrl(f)
      const a = document.createElement('a'); a.href = url; a.download = f.file_name || 'file'; a.target = '_blank'; a.click()
    } catch (e) { toast('无法下载：' + e.message, 'error') }
  }

  const handleDelete = async (f) => {
    if (!window.confirm('确定删除？')) return
    if (f.bucket && f.bucket !== 'ssm-files') await supabase.storage.from(f.bucket).remove([f.storage_path])
    else await supabase.storage.from('ssm-files').remove([f.file_url.split('/ssm-files/')[1]])
    await supabase.from('files').delete().eq('id', f.id)
    toast('已删除', 'error'); onReload()
  }

  return (
    <div className="space-y-3">
      {!ssmId && (
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-xs text-amber-700">
          ⚠️ 这个案件还没有关联 SSM 资料，文件无法上传。请先到「资料」Tab 补上 SSM 资料，再回来这里上传。
        </div>
      )}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreview(null)} className="absolute -top-10 right-0 text-white text-2xl font-bold">✕</button>
            {preview.file_name?.match(/\.(jpg|jpeg|png|gif|webp)$/i)
              ? <img src={preview.url} alt={preview.file_name} className="w-full rounded-xl" />
              : <iframe src={preview.url} title={preview.file_name} className="w-full h-96 rounded-xl bg-white" />}
            <p className="text-white text-xs text-center mt-2">{preview.file_name}</p>
          </div>
        </div>
      )}
      {FILE_CATS.map(cat => {
        const catFiles = files.filter(f => f.category === cat)
        return (
          <div key={cat} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-sm">{cat === 'IC (Owner)' ? '🪪' : cat === 'SSM Document' ? '🏢' : cat === 'Bank Document' ? '🏦' : cat === 'ATM Card Photo' ? '💳' : '📄'}</span>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{cat}</span>
                {catFiles.length > 0 && <span className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full">{catFiles.length}</span>}
              </div>
              {currentUser.role !== 'viewer' && (
                <label className={`cursor-pointer px-3 py-1 text-xs rounded-lg font-medium text-white ${uploading ? 'bg-slate-400' : 'bg-teal-600 hover:bg-teal-700'}`}>
                  {uploading ? '...' : '+ 上传'}
                  <input type="file" accept="image/*,.pdf,.doc,.docx" className="hidden" disabled={uploading} onChange={e => handleUpload(cat, e)} />
                </label>
              )}
            </div>
            {catFiles.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {catFiles.map(f => (
                  <div key={f.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-lg">{f.file_name?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? '🖼️' : '📄'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{f.file_name}</p>
                      <p className="text-[10px] text-slate-400">{new Date(f.created_at).toLocaleDateString('en-MY')}</p>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button onClick={() => openPreview(f)} className="px-2 py-1 text-xs rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200">预览</button>
                      <button onClick={() => downloadFile(f)} className="px-2 py-1 text-xs rounded-lg bg-green-50 text-green-700 hover:bg-green-100">下载</button>
                      {currentUser.role !== 'viewer' && <button onClick={() => handleDelete(f)} className="px-2 py-1 text-xs rounded-lg bg-red-50 text-red-500 hover:bg-red-100">删</button>}
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="px-4 py-3 text-xs text-slate-400 text-center">暂无文件</div>}
          </div>
        )
      })}
    </div>
  )
}


// 银行户口里直接填佣金：交接日期填了就可以填；佣金金额手动填，可以记多笔（Agent / 我 / KLV…），可以分次付款
function BankCommissions({ bank, caseId, comms, pays, agentName, currentUser, toast, onChanged }) {
  const canEdit = ['super_admin', 'admin'].includes(currentUser.role)
  const [modal, setModal] = useState(null)    // { item }
  const [payFor, setPayFor] = useState(null)  // commission
  const money = n => Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const rows = comms.map(c => {
    const paid = pays.filter(p => p.commission_id === c.id).reduce((s, p) => s + Number(p.amount || 0), 0)
    return { ...c, paid, out: Math.max(0, Number(c.amount) - paid) }
  })
  const totalOut = rows.reduce((s, r) => s + r.out, 0)
  const remove = async (r) => {
    if (!window.confirm(`删除这笔佣金？${r.payee} RM ${money(r.amount)}（付款记录也会一起删除）`)) return
    const { error } = await supabase.from('commissions').delete().eq('id', r.id)
    if (error) { toast('删除失败：' + error.message, 'error'); return }
    toast('已删除'); onChanged()
  }
  return (
    <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-teal-50/40 dark:bg-slate-800/40">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold text-teal-600 uppercase tracking-wide">🤝 佣金 {rows.length > 0 && <span className="normal-case font-medium text-slate-500">· 还欠 RM {money(totalOut)}</span>}</p>
        {canEdit && bank.handover_date && bank.com_id && (
          <button onClick={() => setModal({ item: null })} className="px-2 py-1 text-xs rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium">＋ 填佣金</button>
        )}
      </div>
      {!bank.handover_date && <p className="text-xs text-slate-400">填了交接日期后，这里就可以直接填佣金</p>}
      {bank.handover_date && rows.length === 0 && <p className="text-xs text-slate-400">还没有佣金记录{bank.com_id ? ` · ${bank.com_id}` : ''}</p>}
      {rows.map(r => (
        <div key={r.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-teal-100 dark:border-slate-700 last:border-0 text-sm">
          <div className="min-w-0">
            <span className="font-bold text-slate-700 dark:text-slate-200">{r.payee}</span>
            <span className="text-xs text-slate-400 ml-2">{r.note || ''}</span>
          </div>
          <div className="flex items-center gap-2 text-xs whitespace-nowrap">
            <span>RM {money(r.amount)}</span>
            <span className="text-emerald-600">已付 {money(r.paid)}</span>
            <span className={r.out > 0.005 ? 'text-red-500 font-bold' : 'text-emerald-600'}>{r.out > 0.005 ? '欠 ' + money(r.out) : '✓ 已付清'}</span>
            {canEdit && <button onClick={() => setPayFor(r)} className="px-2 py-0.5 rounded-lg bg-teal-50 text-teal-600 hover:bg-teal-100">付款</button>}
            {canEdit && <button onClick={() => setModal({ item: r })} className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200">编辑</button>}
            {canEdit && <button onClick={() => remove(r)} className="px-2 py-0.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100">删</button>}
          </div>
        </div>
      ))}
      {modal && <BankCommissionModal bank={bank} caseId={caseId} item={modal.item} defaultPayee={agentName} currentUser={currentUser} toast={toast}
        onClose={() => setModal(null)} onSaved={() => { setModal(null); toast('佣金已保存'); onChanged() }} />}
      {payFor && <BankCommissionPayModal row={payFor} payments={pays.filter(p => p.commission_id === payFor.id)} currentUser={currentUser} toast={toast}
        onClose={() => setPayFor(null)} onChanged={onChanged} />}
    </div>
  )
}

function BankCommissionModal({ bank, caseId, item, defaultPayee, currentUser, toast, onClose, onSaved }) {
  const [f, setF] = useState({ payee: item?.payee || defaultPayee || 'KLV', amount: item?.amount ?? '', commission_date: item?.commission_date || new Date().toISOString().slice(0, 10), note: item?.note || '' })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!f.payee) { toast('请选收佣金的人', 'error'); return }
    if (!(Number(f.amount) > 0)) { toast('请填佣金金额', 'error'); return }
    setBusy(true)
    const payload = { case_id: caseId, bank_account_id: bank.id, payee: f.payee, amount: Number(f.amount), commission_date: f.commission_date || null, note: f.note || null }
    const { error } = item ? await supabase.from('commissions').update(payload).eq('id', item.id) : await supabase.from('commissions').insert({ ...payload, created_by: currentUser.id })
    setBusy(false)
    if (error) { toast('保存失败：' + error.message, 'error'); return }
    onSaved()
  }
  return (
    <Modal title={`${item ? '编辑' : '填'}佣金 · ${bank.com_id || bank.bank_name}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
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

function BankCommissionPayModal({ row, payments, currentUser, toast, onClose, onChanged }) {
  const money = n => Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const [amount, setAmount] = useState(row.out > 0 ? String(row.out) : '')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState('transfer')
  const [busy, setBusy] = useState(false)
  const add = async () => {
    const a = Number(amount)
    if (!(a > 0)) { toast('请填金额', 'error'); return }
    if (a > row.out + 0.005 && !window.confirm(`RM ${money(a)} 超过还欠的 RM ${money(row.out)}，确定吗？`)) return
    setBusy(true)
    const { error } = await supabase.from('commission_payments').insert({ commission_id: row.id, amount: a, paid_date: date || null, payment_method: method, created_by: currentUser.id })
    setBusy(false)
    if (error) { toast('保存失败：' + error.message, 'error'); return }
    toast('已记录付款'); onChanged(); onClose()
  }
  const del = async (p) => {
    if (!window.confirm(`删除这笔付款 RM ${money(p.amount)}？`)) return
    const { error } = await supabase.from('commission_payments').delete().eq('id', p.id)
    if (error) { toast('删除失败：' + error.message, 'error'); return }
    toast('已删除'); onChanged(); onClose()
  }
  return (
    <Modal title={`佣金付款 · ${row.payee}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center bg-slate-50 rounded-xl py-3 text-sm">
          <div><p className="text-[11px] text-slate-400">佣金</p><p className="font-bold">RM {money(row.amount)}</p></div>
          <div><p className="text-[11px] text-slate-400">已付</p><p className="font-bold text-emerald-600">RM {money(row.paid)}</p></div>
          <div><p className="text-[11px] text-slate-400">还欠</p><p className="font-bold text-red-500">RM {money(row.out)}</p></div>
        </div>
        {payments.map(p => (
          <div key={p.id} className="flex items-center justify-between text-xs border-b border-slate-100 py-1">
            <span className="text-slate-500">{fmt(p.paid_date)}{p.payment_method ? ' · ' + (PAYMENT_METHODS[p.payment_method]?.label || p.payment_method) : ''}</span>
            <span><b className="text-emerald-600">RM {money(p.amount)}</b> <button onClick={() => del(p)} className="text-red-400 ml-2">删</button></span>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
          <Field label="这次付 (RM)"><Inp type="number" value={amount} onChange={setAmount} /></Field>
          <Field label="日期"><Inp type="date" value={date} onChange={setDate} /></Field>
          <Field label="付款方式" span2><Sel value={method} onChange={setMethod} options={Object.entries(PAYMENT_METHODS).map(([value, m]) => ({ value, label: `${m.icon} ${m.label}` }))} /></Field>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">关闭</button>
          <button onClick={add} disabled={busy} className="px-5 py-2 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50">记录付款</button>
        </div>
      </div>
    </Modal>
  )
}
