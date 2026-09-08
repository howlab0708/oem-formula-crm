import ConsultingWorkspace from '@/components/ConsultingWorkspace'
import { deployLabel } from '@/lib/deployment'

export default function Page() {
  // 회사 이름표는 서버에서 읽어 넘긴다. 브라우저에 노출할 값이 아니라 화면에 쓰는 글자다.
  return <ConsultingWorkspace deployLabel={deployLabel()} />
}
