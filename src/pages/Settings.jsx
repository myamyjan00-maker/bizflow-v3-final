import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ROLES } from '../lib/constants'
import { Modal, Field, Inp, Sel } from '../components/UI'

export default function Settings({ currentUser, toast }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [afterCreate, setAfterCreate] = useState(null) // 新建成功后，显示后续手动步骤
  const [form, setForm] = useState({ username: '', display_name: '', role: 'agent', status: 'active' })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => { loadUsers() }, [])

  const loadUsers = async () => {
    const { data } = await supabase.from('users').select('*').order('created_at')
    setUsers(data || [])
    setLoading(false)
  }

  const saveUser = async () => {
    if (!form.username || !form.display_name) { toast('请填写完整资料', 'error'); return }
    if (modal === 'add') {
      // 注意：不再写入明文密码欄位。新用户只建立资料列，登入账号要在 Supabase Auth 后台另外建立。
      const { username, display_name, role, status } = form
      const { error } = await supabase.from('users').insert({ username, display_name, role, status })
      if (error) { toast(error.message, 'error'); return }
      toast('资料已建立，请完成后续步骤才能登入'); setModal(null)
      setAfterCreate(username)
      loadUsers()
      return
    } else {
      const { username, display_name, role, status } = form
      const { error } = await supabase.from('users').update({ display_name, role, status }).eq('id', modal.id)
      if (error) { toast(error.message, 'error'); return }
    }
    toast('已保存'); setModal(null); loadUsers()
  }

  const toggleStatus = async (user) => {
    const newStatus = user.status === 'active' ? 'inactive' : 'active'
    await supabase.from('users').update({ status: newStatus }).eq('id', user.id)
    toast(`${user.display_name} 已${newStatus === 'active' ? '启用' : '停用'}`)
    loadUsers()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-black text-slate-800 dark:text-slate-100">系统设置</h1>
          <p className="text-xs text-slate-500">用户管理 · 角色权限</p>
        </div>
        <button onClick={() => { setForm({ username: '', display_name: '', role: 'agent', status: 'active' }); setModal('add') }}
          className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold transition-colors">
          + 新增用户
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
            <tr>
              {['用户名', '显示名称', '角色', '状态', '登入账号', '操作'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 dark:text-slate-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">{u.username}</td>
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{u.display_name}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    u.role === 'super_admin' ? 'bg-purple-100 text-purple-700' :
                    u.role === 'admin' ? 'bg-teal-100 text-teal-700' :
                    u.role === 'agent' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                  }`}>{ROLES[u.role]}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    {u.status === 'active' ? '启用' : '停用'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {u.auth_id
                    ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">✅ 已连结</span>
                    : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">⚠️ 未连结，无法登入</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => { setForm(u); setModal(u) }} className="px-2 py-1 text-xs rounded-lg bg-teal-50 text-teal-600 hover:bg-teal-100">编辑</button>
                    {u.id !== currentUser.id && (
                      <button onClick={() => toggleStatus(u)} className={`px-2 py-1 text-xs rounded-lg ${u.status === 'active' ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
                        {u.status === 'active' ? '停用' : '启用'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div className="px-4 py-8 text-center text-slate-400 text-sm">加载中...</div>}
      </div>

      {modal && (
        <Modal title={modal === 'add' ? '新增用户' : '编辑用户'} onClose={() => setModal(null)}>
          {modal === 'add' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-xs text-amber-700">
              ⚠️ 这里只会建立用户资料，<b>不会自动建立登入账号</b>。保存后需要另外去 Supabase Auth 后台手动建立登入账号，否则这个用户无法登入。
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="用户名 *"><Inp value={form.username} onChange={v => set('username', v)} disabled={modal !== 'add'} /></Field>
            <Field label="显示名称 *"><Inp value={form.display_name} onChange={v => set('display_name', v)} /></Field>
            <Field label="角色"><Sel value={form.role} onChange={v => set('role', v)} options={Object.entries(ROLES).map(([v, l]) => ({ value: v, label: l }))} /></Field>
            <Field label="状态"><Sel value={form.status} onChange={v => set('status', v)} options={['active', 'inactive']} /></Field>
          </div>
          <div className="flex gap-2 justify-end mt-4 pt-4 border-t border-slate-200">
            <button onClick={() => setModal(null)} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">取消</button>
            <button onClick={saveUser} className="px-5 py-2 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white">保存</button>
          </div>
        </Modal>
      )}

      {/* 新建用户后的后续步骤提示 */}
      {afterCreate && (
        <Modal title="✅ 用户资料已建立，还差最后一步" onClose={() => setAfterCreate(null)}>
          <div className="space-y-3 text-sm">
            <p className="text-slate-600">用户名 <b className="font-mono">{afterCreate}</b> 的资料已经存好，但<b>现在还不能登入</b>，需要你手动完成：</p>
            <ol className="list-decimal pl-5 space-y-2 text-slate-600">
              <li>打开 Supabase 后台 → <b>Authentication → Users → Add user → Create new user</b>（不是 Invite）</li>
              <li>Email 填：<span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">{afterCreate}@bizflow.local</span>，设定密码，勾选 Auto Confirm</li>
              <li>在 SQL Editor 跑这段，把新账号关联回来：
                <pre className="bg-slate-800 text-slate-100 rounded-lg p-3 mt-1 text-xs overflow-x-auto">{`update users set auth_id = (select id from auth.users where email = '${afterCreate}@bizflow.local')
where username = '${afterCreate}';`}</pre>
              </li>
            </ol>
            <p className="text-xs text-slate-400">完成后回到这个页面刷新，「登入账号」那一栏会显示 ✅ 已连结。</p>
            <div className="flex justify-end pt-2">
              <button onClick={() => setAfterCreate(null)} className="px-5 py-2 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white">知道了</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
