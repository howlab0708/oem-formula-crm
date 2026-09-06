'use client'

export async function readLogo(file: File): Promise<string> {
  if (!['image/png','image/jpeg'].includes(file.type) || file.size > 2*1024*1024) throw new Error('2MB 이하 PNG·JPG 로고를 선택해 주세요.')
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('로고 이미지를 읽지 못했습니다.') })
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width*bitmap.height > 20000000) throw new Error('로고는 2천만 화소 이하 이미지를 사용해 주세요.')
    const scale = Math.min(1, 600 / bitmap.width, 240 / bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width*scale)); canvas.height = Math.max(1, Math.round(bitmap.height*scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('로고를 처리하지 못했습니다.')
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } finally { bitmap.close() }
}
