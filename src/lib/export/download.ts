'use client'

import type { Product } from '../types'

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // 즉시 해제하면 사파리에서 다운로드가 취소되는 경우가 있어 한 틱 뒤에 정리한다.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('이미지를 만들지 못했습니다.'))
    }, 'image/png')
  })
}

export async function downloadCanvasAsPng(canvas: HTMLCanvasElement, fileName: string) {
  const blob = await canvasToBlob(canvas)
  triggerDownload(blob, fileName)
}

/** 이미지 클립보드 복사. 지원하지 않는 브라우저에서는 false 를 돌려준다. */
export async function copyCanvasToClipboard(canvas: HTMLCanvasElement): Promise<boolean> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false
  try {
    const blob = await canvasToBlob(canvas)
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return true
  } catch {
    return false
  }
}

const A4 = { width: 595.28, height: 841.89 }
const MARGIN = 24
/** 흰 배경 위 텍스트라 JPEG 로도 열화가 눈에 띄지 않는다. PNG 로 넣으면 파일이 10MB 를 넘는다. */
const JPEG_QUALITY = 0.92

/** 원본 캔버스의 일부를 흰 배경 위에 올려 JPEG 데이터 URL 로 만든다. */
function sliceToJpeg(canvas: HTMLCanvasElement, offsetY: number, height: number): string {
  const slice = document.createElement('canvas')
  slice.width = canvas.width
  slice.height = height
  const ctx = slice.getContext('2d')
  if (!ctx) throw new Error('PDF 변환용 캔버스를 만들지 못했습니다.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, slice.width, height)
  ctx.drawImage(canvas, 0, offsetY, canvas.width, height, 0, 0, canvas.width, height)
  return slice.toDataURL('image/jpeg', JPEG_QUALITY)
}

/**
 * 캔버스를 A4 세로 PDF 로 저장한다.
 * 카드가 한 장을 넘으면 같은 폭으로 잘라 여러 페이지에 이어 붙인다.
 */
export async function downloadCanvasAsPdf(canvas: HTMLCanvasElement, fileName: string) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true })

  const printableWidth = A4.width - MARGIN * 2
  const printableHeight = A4.height - MARGIN * 2
  const scale = printableWidth / canvas.width
  const sliceHeightPx = Math.floor(printableHeight / scale)

  let offset = 0
  let page = 0
  while (offset < canvas.height) {
    const height = Math.min(sliceHeightPx, canvas.height - offset)
    if (page > 0) doc.addPage()
    doc.addImage(
      sliceToJpeg(canvas, offset, height),
      'JPEG',
      MARGIN,
      MARGIN,
      printableWidth,
      height * scale,
    )
    offset += height
    page += 1
  }

  doc.save(fileName)
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

const CSV_HEADER = ['제품명', '제조원', '제형', '규격', '주원료', '지표성분 함량', '부원료']

function escapeCsv(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** 현재 필터 결과를 이 도구가 다시 읽을 수 있는 7열 CSV 로 내보낸다. */
export function downloadProductsAsCsv(products: Product[], fileName: string) {
  const rows = products.map((product) =>
    [
      product.name,
      product.manufacturer,
      product.formRaw,
      product.weightLabel,
      product.mainIngredients.join(' | '),
      product.mainDetail,
      product.subIngredients.join(' | '),
    ]
      .map((cell) => escapeCsv(cell ?? ''))
      .join(','),
  )

  const csv = [CSV_HEADER.join(','), ...rows].join('\r\n')
  // 엑셀이 한글을 깨뜨리지 않도록 UTF-8 BOM 을 붙인다.
  triggerDownload(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' }), fileName)
}
