import { parseMyKad, mergeResults } from './icParse'

// 手机照片通常太小/太暗/有反光：先放大到合适尺寸、转灰度、拉开对比度，再识别
export async function prep(file, binarize) {
  const bmp = await createImageBitmap(file)
  const maxSide = Math.max(bmp.width, bmp.height)
  const scale = maxSide < 2400 ? 2400 / maxSide : Math.min(1, 3200 / maxSide)
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale)
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bmp, 0, 0, w, h)
  const img = ctx.getImageData(0, 0, w, h), d = img.data
  const hist = new Array(256).fill(0)
  for (let i = 0; i < d.length; i += 4) { const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]); d[i] = g; hist[g]++ }
  const total = w * h; let acc = 0, lo = 0, hi = 255
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= total * 0.02) { lo = i; break } }
  acc = 0
  for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= total * 0.02) { hi = i; break } }
  const span = Math.max(1, hi - lo)
  let thr = 128
  if (binarize) { // Otsu
    const h2 = new Array(256).fill(0)
    for (let i = 0; i < d.length; i += 4) { const g = Math.min(255, Math.max(0, Math.round((d[i] - lo) * 255 / span))); h2[g]++ }
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * h2[i]
    let sB = 0, wB = 0, best = 0
    for (let i = 0; i < 256; i++) { wB += h2[i]; if (!wB) continue; const wF = total - wB; if (!wF) break; sB += i * h2[i]; const mB = sB / wB, mF = (sum - sB) / wF; const v = wB * wF * (mB - mF) * (mB - mF); if (v > best) { best = v; thr = i } }
  }
  for (let i = 0; i < d.length; i += 4) {
    let g = Math.min(255, Math.max(0, Math.round((d[i] - lo) * 255 / span)))
    if (binarize) g = g > thr ? 255 : 0
    d[i] = d[i + 1] = d[i + 2] = g; d[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return cv
}

// 原图 + 放大增强图共识别 6 次（含 2 次专门读数字），再合并结果
export async function scanIc(file, T, onProgress = () => {}) {
  const worker = await T.createWorker('eng', 1, (typeof window !== 'undefined' && window.__TESS_OPTS) || {})
  // [预处理方式, 版面模式, 字符白名单]：raw=原图，gray=放大增强，bin=黑白二值
  const passes = [['raw', '11', ''], ['raw', '6', ''], ['gray', '6', ''], ['bin', '6', ''], ['raw', '11', '0123456789-'], ['gray', '11', '0123456789-']]
  const results = []
  try {
    for (let i = 0; i < passes.length; i++) {
      onProgress(`${i + 1}/${passes.length}`)
      await worker.setParameters({ tessedit_pageseg_mode: passes[i][1], tessedit_char_whitelist: passes[i][2] })
      const { data } = await worker.recognize(passes[i][0] === 'raw' ? file : await prep(file, passes[i][0] === 'bin'))
      const lines = (data.lines || []).map(l => ({ text: l.text, conf: l.confidence }))
      results.push(parseMyKad(lines.length ? lines : String(data.text || '').split('\n').map(t => ({ text: t, conf: 70 }))))
    }
  } finally { await worker.terminate() }
  return mergeResults(results)
}
