import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// 一次性工具：把旧的 IC 照片从公开桶(ssm-files)复制到私有桶(owner-ic)。
// 只复制 category = 'IC (Owner)' 的文件；旧文件不会被删除。
export default function IcMigration({ toast }) {
  const [rows, setRows] = useState([])
  const [log, setLog] = useState({})
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const { data } = await supabase.from('files').select('id, owner_id, file_name, file_url, bucket, storage_path, legacy_url').eq('category', 'IC (Owner)').order('created_at')
    setRows(data || [])
  }
  useEffect(() => { load() }, [])
  const set = (id, v) => setLog(p => ({ ...p, [id]: v }))
  const pending = rows.filter(r => r.bucket !== 'owner-ic')
  const done = rows.filter(r => r.bucket === 'owner-ic')

  const migrate = async () => {
    if (!window.confirm(`复制 ${pending.length} 张 IC 照片到私有桶？旧文件不会被删除。`)) return
    setBusy(true)
    for (const r of pending) {
      try {
        const oldPath = decodeURIComponent((r.file_url || '').split('/ssm-files/')[1] || '')
        if (!oldPath) throw new Error('找不到旧路径')
        const newPath = `${r.owner_id}/${oldPath.split('/').pop()}`
        let { error } = await supabase.storage.from('ssm-files').copy(oldPath, newPath, { destinationBucket: 'owner-ic' })
        if (error && !/exists|duplicate/i.test(error.message)) {
          // 备用办法：下载再上传
          const blob = await (await fetch(r.file_url)).blob()
          const up = await supabase.storage.from('owner-ic').upload(newPath, blob, { contentType: blob.type, upsert: false })
          if (up.error && !/exists|duplicate/i.test(up.error.message)) throw up.error
        }
        const { error: uErr } = await supabase.from('files').update({ bucket: 'owner-ic', storage_path: newPath, legacy_url: r.file_url, file_url: null }).eq('id', r.id)
        if (uErr) throw uErr
        set(r.id, '✅ 已复制')
      } catch (e) { set(r.id, '❌ ' + (e.message || e)) }
    }
    setBusy(false); load()
  }

  const verify = async () => {
    setBusy(true)
    for (const r of done) {
      try {
        const { data, error } = await supabase.storage.from('owner-ic').createSignedUrl(r.storage_path, 120)
        if (error) throw error
        const a = await (await fetch(data.signedUrl)).blob()
        const b = await (await fetch(r.legacy_url)).blob()
        set(r.id, a.size > 0 && a.size === b.size ? `✅ 完整 (${a.size} bytes)` : `❌ 大小不一致 ${a.size} / ${b.size}`)
      } catch (e) { set(r.id, '❌ ' + (e.message || e)) }
    }
    setBusy(false)
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-lg font-black text-slate-800">🔒 IC 照片迁移到私有存储</h1>
        <p className="text-xs text-slate-500">只处理「IC (Owner)」类别 · 先复制、后核对 · 旧文件不删除</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border bg-amber-50 border-amber-100 p-4"><p className="text-xs text-amber-700">还没迁移</p><p className="text-2xl font-black text-amber-700">{pending.length}</p></div>
        <div className="rounded-2xl border bg-emerald-50 border-emerald-100 p-4"><p className="text-xs text-emerald-700">已在私有桶</p><p className="text-2xl font-black text-emerald-700">{done.length}</p></div>
      </div>
      <div className="flex gap-2">
        <button onClick={migrate} disabled={busy || !pending.length} className="px-4 py-2 text-sm rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold disabled:opacity-40">1. 开始复制</button>
        <button onClick={verify} disabled={busy || !done.length} className="px-4 py-2 text-sm rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold disabled:opacity-40">2. 核对完整性</button>
        {busy && <span className="text-xs text-slate-500 self-center">处理中…请不要关闭页面</span>}
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
        {rows.map(r => (
          <div key={r.id} className="flex justify-between gap-3 px-4 py-2 text-xs">
            <span className="truncate text-slate-600">{r.file_name}</span>
            <span className="whitespace-nowrap">{log[r.id] || (r.bucket === 'owner-ic' ? '已在私有桶' : '待迁移')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
