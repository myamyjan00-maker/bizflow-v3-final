export const CASE_STATUSES = [
  'Received From Agent',
  'SSM4U Registration',
  'Waiting Customer Activation',
  'SSM Registration',
  'Waiting Bank Opening',
  'Bank Processing',
  'Deposit Out',
  'Deduct Charges',            // 新增：扣费结算（记录银行手续费 + 汇率差，确定净退回金额）
  'Waiting Deposit Return',
  'Ready For Handover',
  'Completed',
]

export const CASE_STATUS_COLORS = {
  'Received From Agent':       'bg-slate-100 text-slate-700',
  'SSM4U Registration':        'bg-purple-100 text-purple-700',
  'Waiting Customer Activation':'bg-indigo-100 text-indigo-700',
  'SSM Registration':          'bg-blue-100 text-blue-700',
  'Waiting Bank Opening':      'bg-cyan-100 text-cyan-700',
  'Bank Processing':           'bg-amber-100 text-amber-700',
  'Deposit Out':               'bg-orange-100 text-orange-700',
  'Deduct Charges':            'bg-rose-100 text-rose-700',
  'Waiting Deposit Return':    'bg-yellow-100 text-yellow-700',
  'Ready For Handover':        'bg-lime-100 text-lime-700',
  'Completed':                 'bg-green-100 text-green-700',
}

export const CASE_STATUS_ICONS = {
  'Received From Agent':       '📥',
  'SSM4U Registration':        '📝',
  'Waiting Customer Activation':'⏳',
  'SSM Registration':          '🏢',
  'Waiting Bank Opening':      '🏦',
  'Bank Processing':           '⚙️',
  'Deposit Out':               '💸',
  'Deduct Charges':            '🧾',
  'Waiting Deposit Return':    '🔄',
  'Ready For Handover':        '✅',
  'Completed':                 '🎉',
}

// ── 案件异常 / 终止分支（下一步 StatusChangeModal 会用到）───────────────────
export const TERMINATION_TYPES = {
  rejected:  { label: '被拒 (Rejected)',   icon: '🔴', color: 'bg-red-100 text-red-700' },
  withdrawn: { label: '撤回 (Withdrawn)',  icon: '⚫', color: 'bg-slate-200 text-slate-700' },
}

export const DEPOSIT_RECOVERY_STATUSES = {
  pending:            { label: '追讨中',       color: 'bg-amber-100 text-amber-700' },
  full_recovered:     { label: '全额追回',     color: 'bg-green-100 text-green-700' },
  partial_recovered:  { label: '部分追回',     color: 'bg-lime-100 text-lime-700' },
  company_absorbed:   { label: '公司吸收（亏损）', color: 'bg-red-100 text-red-700' },
}

export const DEPOSIT_RECOVERY_TARGETS = {
  agent:    'Agent',
  customer: '客户',
  both:     'Agent + 客户',
}

export const BANKS = ['RHB','Maybank','CIMB','Affin','Public Bank','Hong Leong','Bank Islam','Bank Muamalat']

export const BANK_STATUSES = ['New','Bank Processing','Ready','Completed','Blacklist']

export const BANK_STATUS_COLORS = {
  'New':          'bg-purple-100 text-purple-700',
  'Bank Processing':'bg-amber-100 text-amber-700',
  'Ready':        'bg-lime-100 text-lime-700',
  'Completed':    'bg-green-100 text-green-700',
  'Blacklist':    'bg-red-100 text-red-700',
}

export const PAYMENT_METHODS = {
  transfer: { label: '转账', icon: '🏦' },
  cash: { label: '现金', icon: '💵' },
}

export const COST_CATEGORIES = [
  { key:'ssm_fee',    label:'SSM 注册费',  icon:'📋' },
  { key:'chop',       label:'做 Chop',     icon:'🔖' },
  { key:'simcard',    label:'电话卡',       icon:'📱' },
  { key:'bank_charge',label:'Bank Charge', icon:'🏦' },
  { key:'forex',      label:'外汇 Charge', icon:'💱' },
  { key:'deposit',    label:'Deposit',     icon:'💰' },
  { key:'card_fee',   label:'Card 费用',   icon:'💳' },
  { key:'other',      label:'其他',         icon:'💵' },
]

export const FILE_CATS = ['IC (Owner)','SSM Document','Bank Document','ATM Card Photo','Others']

export const ROLES = { super_admin:'Super Admin', admin:'Admin', agent:'Agent', viewer:'Viewer' }

export const fmt = (d) => d ? new Date(d).toLocaleDateString('en-MY') : '—'
export const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-MY') : '—'
export const fmtMoney = (n) => n ? `RM ${Number(n).toFixed(2)}` : '—'
