import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// 「谁先垫付」下拉：我自己 / 公司 / Agent / 自己加的人。可以直接在这里新增垫付人，以后所有地方都选得到。
export default function PayerSelect({ value, onChange }) {
  const [names, setNames] = useState([])
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [err, setErr] = useState('')

  const load = async () => {
    const [{ data: p }, { data: a }] = await Promise.all([
      supabase.from('payers').select('name').order('name'),
      supabase.from('users').select('display_name').eq('role', 'agent').eq('status', 'active'),
    ])
    const set = new Set([...(p || []).map(x => x.name), ...(a || []).map(x => x.display_name)])
    setNames([...set].filter(n => n && n !== '我自己' && n !== '公司').sort())
  }
  useEffect(() => { load() }, [])

  const options = ['我自己', '公司', ...names]
  if (value && !options.includes(value)) options.push(value)

  const add = async () => {
    const n = newName.trim()
    if (!n) return
    if (options.includes(n)) { onChange(n); setAdding(false); setNewName(''); return }
    const { error } = await supabase.from('payers').insert({ name: n })
    if (error) { setErr('保存失败：' + error.message); return }
    setErr(''); await load(); onChange(n); setAdding(false); setNewName('')
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select value={value || '我自己'} onChange={e => onChange(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
          {options.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <button type="button" onClick={() => setAdding(a => !a)}
          className="px-3 py-2 text-xs rounded-lg bg-teal-50 text-teal-600 hover:bg-teal-100 font-medium whitespace-nowrap">＋ 新增</button>
      </div>
      {adding && (
        <div className="flex gap-2">
          <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="输入垫付人名字" autoFocus
            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          <button type="button" onClick={add} className="px-3 py-2 text-xs rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold">保存</button>
        </div>
      )}
      {err && <p className="text-xs text-red-500">{err}</p>}
    </div>
  )
}
