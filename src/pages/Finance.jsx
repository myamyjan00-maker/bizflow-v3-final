import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmt, fmtDateTime, PAYMENT_METHODS } from '../lib/constants'
import { Modal, Field, Inp } from '../components/UI'

export default function Finance({ currentUser, toast }) {
  const [accounts, setAccounts] = useState([])
  const [transactions, setTransactions] = useState([])
  const [deposits, setDeposits] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdjust, setShowAdjust] = useState(null)
  const [showTxn, setShowTxn] = useState(false)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    const [{ data: a }, { data: t }, { data: d }] = await Promise.all([
      supabase.from('company_accounts').select('*').order('name'),
      supabase.from('account_transactions').select('*, company_accounts!account_id(name), cases(case_no), bank_accounts(bank_name,account_no)').order('created_at', { ascending: false }).limit(50),
      supabase.from('deposits').select('*, bank_accounts(bank_name,account_no), ssm(ssm_name), company_accounts!account_id(name)').eq('status', 'pending').order('created_at', { ascending: false }),
    ])
    setAccounts(a || [])
    setTransactions(t || [])
    setDeposits(d || [])
    setLoading(false)
  }

  const adjustBalance = async (accountId, newBalance, note, paymentMethod) => {
    const acc = accounts.find(a => a.id === accountId)
    const diff = Number(newBalance) - Number(acc.balance)
    await supabase.from('company_accounts').update({ balance: Number(newBalance), updated_at: new Date() }).eq('id', accountId)
    await supabase.from('account_transactions').insert({
      account_id: accountId, type: diff >= 0 ? 'adjustment_in' : 'adjustment_out',
      amount: Math.abs(diff), payment_method: paymentMethod, note: note || '手动调整余额', created_by: currentUser.id,
    })
    toast('余额已更新'); setShowAdjust(null); loadData()
  }

  // returned_amount 是较新才加入的栏位，旧数据可能没有值，做兼容兜底
  const getReturnedAmount = (d) => {
    if (d.returned_amount !== null && d.returned_amount !== undefined) return Number(d.returned_amount) || 0
    if (d.status === 'returned') return (Number(d.amount) || 0) - (Number(d.bank_charge) || 0)
    return 0
  }
  const totalBalance = accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0)
  const totalOutstanding = deposits.reduce((s, d) => s + ((Number(d.amount) || 0) - (Number(d.bank_charge) || 0) - getReturnedAmount(d)), 0)

  const txnTypeLabels = {
    deposit_out: { label: 'Deposit 出款', color: 'text-red-600', sign: '-' },
    deposit_return: { label: 'Deposit 回款', color: 'text-green-600', sign: '+' },
    adjustment_in: { label: '调整（入）', color: 'text-teal-600', sign: '+' },
    adjustment_out: { label: '调整（出）', color: 'text-orange-600', sign: '-' },
    charge: { label: '费用', color: 'text-red-500', sign: '-' },
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-black text-slate-800 dark:text-slate-100">公司财务</h1>
          <p className="text-xs text-slate-500">账户余额 · Deposit 追踪 · 流水记录</p>
        </div>
        <button onClick={loadData} className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200">{loading ? '⏳' : '🔄'}</button>
      </div>

      {/* Account cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {accounts.map(a => (
          <div key={a.id} className="bg-gradient-to-br from-teal-600 to-teal-700 rounded-2xl p-5 text-white">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs text-teal-200 font-medium">{a.name}</p>
                <p className="text-3xl font-black mt-1">
                  RM {Number(a.balance).toLocaleString('en-MY', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <span className="text-3xl">🏦</span>
            </div>
            <p className="text-xs text-teal-200">上次更新：{fmt(a.updated_at)}</p>
            {currentUser.role !== 'viewer' && (
              <button onClick={() => setShowAdjust(a)}
                className="mt-3 w-full py-2 bg-white/20 hover:bg-white/30 rounded-xl text-xs font-medium transition-colors">
                调整余额
              </button>
            )}
          </div>
        ))}

        {/* Total + Outstanding */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4">
          <div>
            <p className="text-xs text-slate-400 font-medium">总余额</p>
            <p className="text-2xl font-black text-slate-800 dark:text-slate-100">
              RM {totalBalance.toLocaleString('en-MY', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
            <p className="text-xs text-slate-400 font-medium">待回 Deposit</p>
            <p className="text-2xl font-black text-amber-600">
              RM {totalOutstanding.toLocaleString('en-MY', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">{deposits.length} 笔未回款</p>
          </div>
        </div>
      </div>

      {/* Outstanding deposits */}
      {deposits.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">⏳ 待回 Deposit ({deposits.length})</h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {deposits.map(d => {
              const outstanding = (Number(d.amount) || 0) - (Number(d.bank_charge) || 0) - getReturnedAmount(d)
              const days = d.transfer_date ? Math.floor((Date.now() - new Date(d.transfer_date).getTime()) / 86400000) : null
              return (
                <div key={d.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{d.ssm?.ssm_name || '—'}</p>
                    <p className="text-xs text-slate-500">{d.bank_accounts?.bank_name} {d.bank_accounts?.account_no && `— ${d.bank_accounts.account_no}`} {d.company_accounts?.name && `· ${d.company_accounts.name}`}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-black text-amber-600">RM {outstanding.toFixed(2)}</p>
                    {days !== null && <p className={`text-[10px] ${days > 7 ? 'text-red-500' : 'text-slate-400'}`}>已过 {days} 天</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Transaction history */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">📋 流水记录（最近50笔）</h3>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {transactions.map(t => {
            const info = txnTypeLabels[t.type] || { label: t.type, color: 'text-slate-600', sign: '' }
            return (
              <div key={t.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{info.label}</span>
                    {t.payment_method && PAYMENT_METHODS[t.payment_method] && (
                      <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded-full">{PAYMENT_METHODS[t.payment_method].icon} {PAYMENT_METHODS[t.payment_method].label}</span>
                    )}
                    {t.cases?.case_no && <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded-full font-mono">{t.cases.case_no}</span>}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{t.company_accounts?.name} · {fmt(t.created_at)} {t.note && `· ${t.note}`}</p>
                </div>
                <p className={`text-sm font-bold flex-shrink-0 ${info.color}`}>
                  {info.sign}RM {Number(t.amount).toFixed(2)}
                </p>
              </div>
            )
          })}
          {transactions.length === 0 && <div className="px-5 py-8 text-center text-slate-400 text-sm">暂无流水记录</div>}
        </div>
      </div>

      {/* Adjust balance modal */}
      {showAdjust && (
        <AdjustModal account={showAdjust} onClose={() => setShowAdjust(null)} onSave={adjustBalance} />
      )}
    </div>
  )
}

function AdjustModal({ account, onClose, onSave }) {
  const [balance, setBalance] = useState(String(account.balance))
  const [note, setNote] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('transfer')
  return (
    <Modal title={`调整 ${account.name} 余额`} onClose={onClose}>
      <div className="space-y-3">
        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-3">
          <p className="text-xs text-slate-400">当前余额</p>
          <p className="text-xl font-black text-slate-800 dark:text-slate-100">RM {Number(account.balance).toFixed(2)}</p>
        </div>
        <Field label="新余额 (RM)"><Inp type="number" value={balance} onChange={setBalance} /></Field>
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
        <Field label="备注"><Inp value={note} onChange={setNote} placeholder="调整原因..." /></Field>
        {balance && (
          <div className={`text-xs px-3 py-2 rounded-lg ${Number(balance) >= Number(account.balance) ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            变动：{Number(balance) >= Number(account.balance) ? '+' : ''}RM {(Number(balance) - Number(account.balance)).toFixed(2)}
          </div>
        )}
        <div className="flex gap-2 justify-end pt-3 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">取消</button>
          <button onClick={() => onSave(account.id, balance, note, paymentMethod)} disabled={!balance}
            className="px-5 py-2 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50">确认更新</button>
        </div>
      </div>
    </Modal>
  )
}
