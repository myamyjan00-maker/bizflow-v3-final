import { supabase } from './supabase'

// 私有桶(owner-ic)里的文件要用「有时效的登录链接」才能看；旧文件仍然用原来的链接
export async function getFileUrl(f, seconds = 300) {
  if (f?.bucket === 'owner-ic' && f.storage_path) {
    const { data, error } = await supabase.storage.from('owner-ic').createSignedUrl(f.storage_path, seconds)
    if (error) throw error
    return data.signedUrl
  }
  return f?.file_url
}

export async function uploadIcFile(file, ownerId) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${ownerId}/${Date.now()}_IC.${ext}`
  const { error } = await supabase.storage.from('owner-ic').upload(path, file, { contentType: file.type || undefined })
  if (error) throw error
  return path
}
