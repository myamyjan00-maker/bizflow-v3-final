import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { CASE_STATUSES, CASE_STATUS_ICONS, fmt } from '../lib/constants'
import { CaseBadge, Pagination, Modal, Field, Inp, Sel } from '../components/UI'

export default function Cases({ currentUser, onNavigate, initialFilter, toast }) {
  const [cases, setCases] = useState([])
  const [owners, setOwners] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(initialFilter?.status || '全部')
  const [agentFilter, setAgentFilter] = useState('全部')
  const [page, setPage] = useState(1)
  const [showNewCase, setShowNewCase] = useState(false)
  const PAGE_SIZE = 25

  useEffect(() => { loadData() }, [])
  useEffect(() => { if (initialFilter?.status) setStatusFilter(initialFilter.status) }, [initialFilter])

  const loadData = async () => {
    setLoading(true)
    const [{ data: c }, { data: o }, { data: a }] = await Promise.all([
      supabase.from('cases').select('*, owners(name,ic,phone), ssm(ssm_name,reg_no,status), users!cases_agent_id_fkey(display_name)').order('created_at', { ascending: false }),
      supabase.from('owners').select('id,name,ic').order('name'),
      supabase.from('users').select('*').eq('role', 'agent').eq('status', 'active'),
    ])
    setCases(currentUser.role === 'agent' ? (c || []).filter(x => x.agent_id === currentUser.id) : (c || []))
    setOwners(o || [])
    setAgents(a || [])
    setLoading(false)
  }

  const filtered = useMemo(() => cases.filter(c => {
    const q = search.toLowerCase()
    const matchSearch = !q || c.ssm?.ssm_name?.toLowerCase().includes(q) ||
      c.owners?.name?.toLowerCase().includes(q) || c.owners?.ic?.includes(q) ||
      c.case_no?.toLowerCase().includes(q) || c.owners?.phone?.includes(q)
    const matchStatus = statusFilter === '全部' || c.status === statusFilter
    const matchAgent = agentFilter === '全部' || c.users?.display_name === agentFilter
    return matchSearch && matchStatus && matchAgent
  }).sort((a, b) => (b.is_blocked ? 1 : 0) - (a.is_blocked ? 1 : 0)), [cases, search, statusFilter, agentFilter])

  useEffect(() => { setPage(1) }, [search, statusFilter, agentFilter])
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const statusCounts = CASE_STATUSES.reduce((acc, s) => {
    acc[s] = cases.filter(c => c.status === s).length
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-black text-slate-800 dark:text-slate-100">客户案件</h1>
          <p className="text-xs text-slate-500">共 {filtered.length} 个案件</p>
        </div>
        {currentUser.role !== 'viewer' && (
          <button onClick={() => setShowNewCase(true)}
            className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold transition-colors">
            + 新建案件
          </button>
        )}
      </div>

      {/* Status filter pills */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setStatusFilter('全部')}
          className={`px-3 py-1.5 text-xs rounded-xl font-medium transition-colors ${statusFilter === '全部' ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}>
          全部 ({cases.length})
        </button>
        {CASE_STATUSES.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs rounded-xl font-medium transition-colors ${statusFilter === s ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}>
            {CASE_STATUS_ICONS[s]} {s.split(' ').slice(-1)[0]} ({statusCounts[s] || 0})
          </button>
        ))}
      </div>

      {/* Search + agent filter */}
      <div className="flex gap-3 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="搜索 案件编号 / 公司名 / Owner / IC / 电话..."
          className="flex-1 min-w-[200px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
        {currentUser.role !== 'agent' && (
          <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            <option>全部</option>
            {agents.map(a => <option key={a.id}>{a.display_name}</option>)}
          </select>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                {['案件编号', '公司名称', 'Owner', 'IC', 'Agent', '当前阶段', '创建日期', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paged.map(c => (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  onClick={() => onNavigate('case', c.id)}>
                  <td className="px-4 py-3 font-mono text-xs text-teal-600 dark:text-teal-400 font-bold">{c.case_no}</td>
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100 max-w-[160px] truncate">{c.ssm?.ssm_name || <span className="text-slate-400 italic">未填</span>}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300 max-w-[120px] truncate">{c.owners?.name || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.owners?.ic || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{c.users?.display_name || '—'}</td>
                  <td className="px-4 py-3"><CaseBadge status={c.status} blocked={c.is_blocked} terminationType={c.termination_type} /></td>
                  <td className="px-4 py-3 text-xs text-slate-400">{fmt(c.created_at)}</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <button onClick={() => onNavigate('case', c.id)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-teal-600 text-white hover:bg-teal-700 font-medium whitespace-nowrap">
                      开启 →
                    </button>
                  </td>
                </tr>
              ))}
              {paged.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                  <p className="text-3xl mb-2">📁</p>
                  <p>{loading ? '加载中...' : '没有找到案件'}</p>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <Pagination page={page} totalPages={totalPages} onChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} />

      {/* New Case Modal */}
      {showNewCase && (
        <NewCaseModal agents={agents} owners={owners} currentUser={currentUser}
          onClose={() => setShowNewCase(false)}
          onSave={() => { setShowNewCase(false); loadData(); toast('案件已创建') }}
          toast={toast} />
      )}
    </div>
  )
}

function NewCaseModal({ agents, owners, currentUser, onClose, onSave, toast }) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ownerSearch, setOwnerSearch] = useState('')
  const [selectedOwner, setSelectedOwner] = useState(null)
  const [form, setForm] = useState({
    agent_id: currentUser.role === 'agent' ? currentUser.id : '',
    owner_name: '', owner_ic: '', owner_mother_name: '', owner_phone: '', owner_email: '', owner_address: '',
    ssm_name: '', reg_no: '', notes: '',
  })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const filteredOwners = owners.filter(o => {
    const q = ownerSearch.toLowerCase()
    return !q || o.name.toLowerCase().includes(q) || o.ic.includes(q)
  }).slice(0, 8)

  const handleCreate = async () => {
    if (!form.agent_id) { setError('请选择 Agent'); return }
    setLoading(true); setError('')
    try {
      let ownerId = selectedOwner?.id
      // Create owner if new
      if (!selectedOwner) {
        if (!form.owner_name || !form.owner_ic) { setError('请填写 Owner 姓名和 IC'); setLoading(false); return }
        const { data: o, error: oErr } = await supabase.from('owners').insert({
          name: form.owner_name, ic: form.owner_ic, mother_name: form.owner_mother_name,
          phone: form.owner_phone, email: form.owner_email, address: form.owner_address,
          agent_id: form.agent_id, created_by: currentUser.id, status: 'active',
        }).select().single()
        if (oErr) { if (oErr.code === '23505') { setError('此 IC 已存在！'); setLoading(false); return } throw oErr }
        ownerId = o.id
      }
      // Create SSM if provided
      let ssmId = null
      if (form.ssm_name) {
        const { data: s, error: sErr } = await supabase.from('ssm').insert({
          ssm_name: form.ssm_name, reg_no: form.reg_no, owner_id: ownerId,
          agent_id: form.agent_id, status: 'New', updated_at: new Date(),
        }).select().single()
        if (sErr) throw sErr
        ssmId = s.id
      }
      // Create case
      const { data: cas, error: cErr } = await supabase.from('cases').insert({
        owner_id: ownerId, ssm_id: ssmId, agent_id: form.agent_id,
        status: 'Received From Agent', notes: form.notes, created_by: currentUser.id,
      }).select().single()
      if (cErr) throw cErr
      // Log timeline
      await supabase.from('case_timeline').insert({
        case_id: cas.id, action: 'Case Created',
        note: `由 ${currentUser.display_name} 创建`, done_by: currentUser.id, done_by_name: currentUser.display_name,
      })
      onSave()
    } catch (e) { setError(e.message); setLoading(false) }
  }

  return (
    <Modal title="新建客户案件" onClose={onClose} wide>
      <div className="space-y-4">
        {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">⚠️ {error}</div>}

        {/* Step tabs */}
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
          {['基本信息', 'Owner', 'SSM'].map((s, i) => (
            <button key={s} onClick={() => setStep(i + 1)}
              className={`flex-1 py-2 text-xs rounded-lg font-medium transition-colors ${step === i + 1 ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {i + 1}. {s}
            </button>
          ))}
        </div>

        {step === 1 && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Agent *" span2>
              <Sel value={form.agent_id} onChange={v => set('agent_id', v)}
                disabled={currentUser.role === 'agent'}
                options={agents.map(a => ({ value: a.id, label: a.display_name }))} />
            </Field>
            <Field label="备注" span2>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
                placeholder="案件备注..." className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">搜索现有 Owner</label>
              <input value={ownerSearch} onChange={e => setOwnerSearch(e.target.value)}
                placeholder="输入姓名或 IC 搜索..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              {ownerSearch && (
                <div className="mt-1 border border-slate-200 rounded-xl overflow-hidden">
                  {filteredOwners.length > 0 ? filteredOwners.map(o => (
                    <button key={o.id} onClick={() => { setSelectedOwner(o); setOwnerSearch('') }}
                      className={`w-full text-left px-4 py-2.5 hover:bg-teal-50 text-sm border-b border-slate-100 last:border-0 ${selectedOwner?.id === o.id ? 'bg-teal-50 font-bold' : ''}`}>
                      <span className="font-medium text-slate-800">{o.name}</span>
                      <span className="text-slate-400 text-xs ml-2">{o.ic}</span>
                    </button>
                  )) : <div className="px-4 py-3 text-sm text-slate-400">没有找到，请填写新 Owner 资料</div>}
                </div>
              )}
            </div>
            {selectedOwner ? (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-green-800">✅ 已选择：{selectedOwner.name}</p>
                  <p className="text-xs text-green-600">{selectedOwner.ic}</p>
                </div>
                <button onClick={() => setSelectedOwner(null)} className="text-xs text-red-500 hover:text-red-700">更换</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <p className="col-span-2 text-xs font-medium text-slate-500">或填写新 Owner 资料：</p>
                <Field label="姓名 *"><Inp value={form.owner_name} onChange={v => set('owner_name', v)} /></Field>
                <Field label="IC No. *"><Inp value={form.owner_ic} onChange={v => set('owner_ic', v)} /></Field>
                <Field label="母亲姓名"><Inp value={form.owner_mother_name} onChange={v => set('owner_mother_name', v)} /></Field>
                <Field label="电话"><Inp value={form.owner_phone} onChange={v => set('owner_phone', v)} /></Field>
                <Field label="Email"><Inp value={form.owner_email} onChange={v => set('owner_email', v)} /></Field>
                <Field label="地址"><Inp value={form.owner_address} onChange={v => set('owner_address', v)} /></Field>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="grid grid-cols-2 gap-3">
            <p className="col-span-2 text-xs text-slate-400">SSM 资料可以之后再填，现在可以跳过</p>
            <Field label="公司名称" span2><Inp value={form.ssm_name} onChange={v => set('ssm_name', v)} placeholder="（可选）" /></Field>
            <Field label="注册号" span2><Inp value={form.reg_no} onChange={v => set('reg_no', v)} placeholder="（可选）" /></Field>
          </div>
        )}

        <div className="flex gap-2 justify-between pt-4 border-t border-slate-200">
          <div className="flex gap-2">
            {step > 1 && <button onClick={() => setStep(s => s - 1)} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">← 上一步</button>}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">取消</button>
            {step < 3
              ? <button onClick={() => setStep(s => s + 1)} className="px-5 py-2 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white">下一步 →</button>
              : <button onClick={handleCreate} disabled={loading} className="px-5 py-2 rounded-xl text-sm font-bold bg-green-600 hover:bg-green-700 text-white disabled:opacity-50">{loading ? '创建中...' : '✓ 创建案件'}</button>
            }
          </div>
        </div>
      </div>
    </Modal>
  )
}
