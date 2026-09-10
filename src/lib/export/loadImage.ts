'use client'

/**
 * 내보내기 캔버스에 그릴 이미지(로고·직인)를 읽는다.
 *
 * `HTMLImageElement.decode()` 를 쓰지 않는다 - 문서에 붙지 않은 이미지에서는 다 읽힌
 * 뒤(`complete` 가 true 이고 `naturalWidth` 도 잡힌 뒤)에도 약속이 끝나지 않는 브라우저가
 * 있다. 그러면 내보내기 단추가 ‘만드는 중…’ 에서 멈춘 채 남고, 사용자는 무엇이 잘못됐는지
 * 알 수 없다. `drawImage` 는 디코딩을 기다리지 않아도 되므로 load 이벤트만 기다린다.
 */
export async function loadExportImage(dataUrl: string, label: string): Promise<HTMLImageElement> {
  const image = new Image()
  const failed = () => new Error(`${label}을 그리지 못했습니다. 이미지를 다시 선택해 주세요.`)
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(failed())
    image.src = dataUrl
    // data URL 은 곧바로 읽히는 경우가 있어 load 이벤트가 오지 않을 수 있다.
    if (image.complete && image.naturalWidth > 0) resolve()
  })
  if (!image.naturalWidth || !image.naturalHeight) throw failed()
  return image
}
