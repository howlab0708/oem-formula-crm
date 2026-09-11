# 기능성 원료 재검토 · 2026-09-11

최종 조회 기준: 사용자의 후속 요청에 따라 현재 적용 기준이 확인된 **고시형 96개·개별인정형 466개, 총 562개만** 제공합니다. 인정 종료·통합 38개, 과거 인정 9개, 미등재·자료 불일치 12개는 앱 원료 데이터와 분류 버튼에서 제거했습니다. 아래 621개 검토 내역과 제외 근거는 개발 검토 문서로만 보존하며 앱 조회·원료 DB 자동완성에는 포함하지 않습니다.

사용자 검토 전 로컬 변경입니다. 배포하지 않았습니다. 즐겨찾기의 별표는 회색 윤곽선 북마크로 교체했습니다.

## 결과

조회 항목 621개 전체를 재검토했습니다. 원본 1,298행(기존 목록 78행, I-0040 773행, I-0050 447행)과 원료별 연결을 보존했습니다. 검토일 갱신 외에 내용이 바뀐 항목은 79개입니다. 아래 수치는 조회 항목 수이며, 인정번호 수나 식약처 전체 원료 수와 다릅니다.

| 구분 | 항목 수 | 화면 적용 |
|---|---:|---|
| 고시형 | 96 | 공전의 현행 기준 |
| 개별인정형 | 466 | 해당 인정번호의 공개 공식 기준 |
| 인정 종료·통합 | 38 | 조회 데이터·분류 버튼에서 제거 |
| 과거 인정 | 9 | 조회 데이터·분류 버튼에서 제거 |
| 미등재·자료 불일치 | 12 | 조회 데이터·분류 버튼에서 제거 |

**과거 인정 9개와 미등재·자료 불일치 12개를 모두 현행 고시형·개별인정형으로 확정한 것은 아닙니다.** 검색 결과가 없다는 사실만으로 법적 미인정 또는 사용불가로 단정하지 않았습니다. 해당 기록은 업무용 조회에서 제거했습니다. 원료명·인정번호가 연결되는 인정서 또는 현행 공식 상세가 확보되면 추가 확정할 수 있습니다.

## 확인한 자료

- [식약처 고시전문 제2026-43호](https://www.mfds.go.kr/brd/m_211/view.do?seq=14973): 96개 고시형. 새로 받은 전문 ZIP은 직전 검토 파일과 SHA-256이 일치했습니다. 2027년 시행 예정 변경은 현행 기준과 계속 분리합니다.
- [식품안전나라 원료 게시판](https://www.foodsafetykorea.go.kr/portal/board/board.do?menu_grp=MENU_NEW01&menu_no=2660): 전체 목록 655건, 연결된 상세 465건을 새로 조회했습니다.
- [식약처 건강기능식품 종합정보](https://data.mfds.go.kr/hid/opcaa01/ingdSrchLst.do): 목록 699건 및 추가 상세 61건. 목록에는 인정 종료 원료도 포함되어 있어 제목만으로 현행 인정 여부를 판정하지 않았습니다.
- [식약처 발간 「건강기능식품 기능성 원료 인정 현황」(2016)](https://www.khff.or.kr/assets/extra/hfood/01.pdf): 과거 인정번호·등급·취소·취하 기록에만 사용했습니다. 현재 효력의 근거로 사용하지 않았습니다. 아래 표의 PDF 쪽수는 파일 페이지이며 인쇄 쪽수보다 4쪽 큽니다.
- [제2016-141호 경과조치](https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000070681): 3등급 4개(2008-34, 2006-5, 2006-23, 2006-20)는 2016년 책자의 등급과 경과조치를 결합한 판단입니다. 개별 번호의 취소 공지를 새로 찾았다는 의미가 아닙니다. 식약처 종합정보의 여러 3등급 상세에도 2019-12-20 제조·수입 종료가 명시되어 있습니다.

[전체 621개 대조표와 출처·변경 이력 JSON](functional-ingredient-review-20260911.json)에 파일 해시, 원료별 분류·인정번호, 공식 상세 조회 목록 및 보완 근거를 남겼습니다. 인정번호·원료명·업체와 본문의 취소·반납·통합 문구를 대조했습니다.

## 주요 수정

- 누락 기준 18개 보완. 한 게시물 안의 여러 원료 구획을 인정번호별로 분리했습니다.
- 나토균배양분말 제2013-6호: CSV 44~64 mg 대신 공식 44~67 mg/일.
- 카제인가수분해물: 제2006-19호의 원료 4,000 mg과 제2009-22·2010-6호의 VPP+IPP 1.8~3.6 mg을 구분했습니다.
- 피니톨 제2005-15호: 현행 간 건강 300 mg/일만 표시하고 폐지된 혈당조절 1.2 g/일을 제외했습니다.
- 지방산복합물 제2009-2호, 석류농축분말 제2018-7호: 게시판에 남아 있으나 본문의 취소·인정서 반납을 반영했습니다.
- 포도종자추출물 제2005-9호: 다른 인정번호의 공식 본문에 적힌 인정서 회수 이력을 반영했습니다.
- 돌외잎주정추출분말: 현행 제2013-8호와 취소된 제2013-3호를 구분했습니다.
- 가자추출물(AyuFlex) 제2022-12호: 2026-09-09 갱신된 공식 상세의 다리 불편감(부기) 완화 기능성을 반영했습니다.

## 검증 및 검토 순서

검토 주소: http://127.0.0.1:3001/

1. 배합비 검색 → 즐겨찾기의 북마크 표시.
2. 기능성 원료 → 전체 562개·고시형 96개·개별인정형 466개만 표시.
3. `2013-6`, `피니톨` 검색 → 현행 기준 상세 확인. `제2018-7호`, `제2008-7호`, `제2017-23호`는 결과가 없어야 합니다.

전체 자동 테스트 83개, 수정 파일 ESLint, TypeScript, 프로덕션 빌드와 diff 공백 검사를 통과했습니다. 데스크톱 브라우저에서 북마크, 원료 분류 집계, 나토·피니톨의 수정 기준, 종료·과거·공란 사례의 상세 표시 및 식약처 원문 링크를 확인했습니다. 브라우저 경고·오류는 없었습니다. 이전 검색 히스토리 변경을 반영하지 못한 테스트 1개는 복원 전 조건을 보존한다는 요청 동작에 맞게 갱신했습니다. 검색 히스토리 구현은 이번에 추가 변경하지 않았습니다.

기능성 원료에는 이번 검토 데이터를 사용합니다. 제품 레퍼런스·즐겨찾기·배합비는 예시 데이터이며 검토 서버의 DB 쓰기는 차단되어 있습니다. 원료 분류 데이터는 배합 설계의 원료 자동완성에서도 참조되므로, 현재 기준에서 제외한 기록의 과거 섭취량이 자동 입력되지 않도록 현행 기준과 보존 자료를 분리했습니다. 계산식·저장 API·검색 매칭·CSV 파서는 수정하지 않았습니다.

## 섭취 기준을 보완한 18개 항목

| 원료 | 인정번호 | 공식 일일섭취량 | 근거 |
|---|---|---|---|
| 자일로올리고당(xylooligosaccharide) 액상 | 제2009-81호 | 자일로올리고당으로서 0.7 ~ 7.5 g/일 | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21595) |
| 토치대두발효추출물 | 제2008-18호 | 토치대두발효추출물로서 900 mg/일 | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21634) |
| 석류효소처리추출물 | 제2010-40호 | 석류효소처리추출물으로서 40 ml/일 | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21583) |
| 리프리놀-초록입홍합추출오일 | 제2009-49호 | 리프리놀-초록입홍합추출오일로서 200 mg/일 | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21534) |
| 지방산복합물 FAC(Fatty Acid Complex) | 제2012-16호 | 지방산복합물로서 1,248 mg/일 | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21617) |
| 아마인 | 제2007-4호 | 아마인으로서 50 g/일 | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21637) |
| 가시오갈피 등 복합추출물 | 제2013-25호 | 가시오갈피 등 복합추출물 로서 1.5 g/일 | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21565) |
| 나토균배양분말 | 제2013-6호 | 나토균배양분말로서 44 ~ 67 mg/일 | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21559) |
| 콩발효추출물 | 제2012-31호 | 콩발효추출물로서 900 mg/일 | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21634) |
| 콩발효추출물 | 제2012-32호 | 콩발효추출물로서 900 mg/일 | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21634) |
| 크랜베리 추출물 | 제2011-39호 | 크랜베리 추출물로서 500 mg/일 | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21578) |
| 피니톨 | 제2005-15호 | 300 mg/일 | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=1076173) |
| L-카르니틴 타르트레이트 | 제2012-19호 | L-카르니틴으로서 2 g/일 | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21575) |
| 유산균발효다시마추출물 | 제2011-23호 | 유산균 발효 다시마 추출물로서 1.5 g/일 | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21566) |
| 아마인 | 제2009-72호 | 아마인으로서 50 g/일 | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21637) |
| 지초추출물 | 제2010-59호 | 지초추출물로서 2,200 mg/일 | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21591) |
| 카제인가수분해물 | 제2010-6호 | VPP(Val-Pro-Pro) 및 IPP(Ile-Pro-Pro)의 합으로서 1.8 ~ 3.6 mg/일 | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21642) |
| 카제인가수분해물 | 제2009-22호 | VPP(Val-Pro-Pro) 및 IPP(Ile-Pro-Pro)의 합으로서 1.8 ~ 3.6 mg/일 | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21642) |

## 인정 종료·통합 38개

| 원료 | 원본/과거 인정번호 | 판정 | 사유 | 근거 |
|---|---|---|---|---|
| 씨제이 테아닌등 복합추출물 | 제2004-3호 | 인정폐지 | 식약처 공식 자료에 제2004-3호의 인정폐지가 명시되어 있습니다. 같은 이름의 다른 인정번호와 구분합니다. | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21665) |
| 초록입홍합추출오일 | 제2014-3호 | 인정취소 | 식약처 2016년 인정 현황에서 제2014-3호의 인정취소를 확인했습니다. | [식약처 2016년 인정 현황 PDF 51쪽](https://www.khff.or.kr/assets/extra/hfood/01.pdf#page=51) |
| 표고버섯균사체 AHCC | 제2008-34호 | 3등급 인정 종료 | 2016년 인정 현황의 해당 번호는 생리활성기능 3등급입니다. 제2016-141호 부칙의 3등급 경과조치에 따라 2019-12-20 제조·수입 효력이 종료된 기준이며, 제2008-78호의 2등급 인정과 구분했습니다. | [식약처 2016년 인정 현황 PDF 75쪽](https://www.khff.or.kr/assets/extra/hfood/01.pdf#page=75) · [3등급 원료 경과조치](https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000070681) |
| FK-23(Enterococcus faecalis 가열처리 건조분말) | 제2006-23호 | 3등급 인정 종료 | 2016년 인정 현황의 제2006-23호는 생리활성기능 3등급입니다. 제2016-141호 부칙의 3등급 경과조치에 따른 종료 기준이며, 제2008-31호에 임의로 연결하지 않았습니다. | [식약처 2016년 인정 현황 PDF 75쪽](https://www.khff.or.kr/assets/extra/hfood/01.pdf#page=75) · [3등급 원료 경과조치](https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000070681) |
| 유니벡스대나무잎추출물 | 제2005-1호 | 인정폐지 | 식약처 공식 자료에 제2005-1호의 인정폐지가 명시되어 있습니다. 같은 이름의 다른 인정번호와 구분합니다. | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21660) |
| 끼꼬망 포도종자추출물 | 제2005-9호 | 인정서 회수 | 식품안전나라 포도종자추출물 공식 상세에 제2005-9호의 인정서 회수로 관련 내용이 삭제되었다고 명시되어 있습니다. 현재 제2008-42호 기준과 구분합니다. | [식약처 원료별 상세](https://www.foodsafetykorea.go.kr/portal/board/boardDetail.do?menu_no=2660&bbs_no=bbs987&ntctxt_no=21657) |
| L. Helveticus 발효물 | 제2013-36호 | 인정폐지 | 식약처 공식 자료에 제2013-36호의 인정폐지가 명시되어 있습니다. 같은 이름의 다른 인정번호와 구분합니다. | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21519) |
| 로즈힙분말 | 제2007-22호 | 자진취하 | 식약처 2016년 인정 현황에 제2007-22호가 자진취하로 표시되어 있습니다. | [식약처 2016년 인정 현황 PDF 34쪽](https://www.khff.or.kr/assets/extra/hfood/01.pdf#page=34) |
| 피니톨 분말 | 제2014-65호 | 인정폐지 | 식약처 공식 자료에 제2014-65호의 인정폐지가 명시되어 있습니다. 같은 이름의 다른 인정번호와 구분합니다. | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=1047319) |
| Green Mate Extract EFLA920 | 제2006-20호 | 3등급 인정 종료 | 2016년 인정 현황의 제2006-20호는 생리활성기능 3등급입니다. 제2016-141호 부칙의 3등급 경과조치에 따른 종료 기준이며, 제2008-52호의 2등급 원료와 구분했습니다. | [식약처 2016년 인정 현황 PDF 90쪽](https://www.khff.or.kr/assets/extra/hfood/01.pdf#page=90) · [3등급 원료 경과조치](https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000070681) |
| 발효울금 | 제2013-4호 | 인정폐지 | 식약처 공식 자료에 제2013-4호의 인정폐지가 명시되어 있습니다. 같은 이름의 다른 인정번호와 구분합니다. | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21548) |
| 도라지추출물(DRJ-AD) | 제2013-13호 | 인정폐지 | 식약처 공식 자료에 제2013-13호의 인정폐지가 명시되어 있습니다. 같은 이름의 다른 인정번호와 구분합니다. | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21527) |
| 발효식초석류복합물 | 제2014-20호 | 인정취소 | 식약처 공식 자료에 제2014-20호의 인정취소가 명시되어 있습니다. 같은 이름의 다른 인정번호와 구분합니다. | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21499) |
| 와일드망고 종자추출물 | 제2014-28호 | 인정취소 | 식약처 공식 자료에 제2014-28호의 인정취소가 명시되어 있습니다. 같은 이름의 다른 인정번호와 구분합니다. | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21491) |
| 허니부쉬추출발효분말 | 제2017-1호 | 인정취소 | 식약처 공식 자료에 제2017-1호의 인정취소가 명시되어 있습니다. 같은 이름의 다른 인정번호와 구분합니다. | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=1062478) |
| 피니톨 분말 | 제2007-12호 | 인정폐지 | 식약처 공식 자료에 제2007-12호의 인정폐지가 명시되어 있습니다. 같은 이름의 다른 인정번호와 구분합니다. | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21655) |
| 소엽추출물 | 제2010-48호 | 인정폐지 | 식약처 공식 자료에 제2010-48호의 인정폐지가 명시되어 있습니다. 같은 이름의 다른 인정번호와 구분합니다. | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21576) |
| 들쭉열매추출물 | 제2013-22호 | 인정폐지 | 식약처 공식 자료에 제2013-22호의 인정폐지가 명시되어 있습니다. 같은 이름의 다른 인정번호와 구분합니다. | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21529) |
| 흑효모배양액분말 | 제2011-2호 | 인정폐지 | 식약처 공식 자료에 제2011-2호의 인정폐지가 명시되어 있습니다. 같은 이름의 다른 인정번호와 구분합니다. | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21573) |
| 녹차추출물/테아닌 복합물 | 제2010-51호 | 인정폐지 | 식약처 공식 자료에 제2010-51호의 인정폐지가 명시되어 있습니다. 같은 이름의 다른 인정번호와 구분합니다. | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21572) |
| 깻잎추출물(PF501) | 제2009-83호 | 인정취소 | 식약처 공식 자료에 제2009-83호의 인정취소가 명시되어 있습니다. 같은 이름의 다른 인정번호와 구분합니다. | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21594) |
| 프로바이오틱스 HY7714 | 제2015-2호 | 인정서 통합 | 공식 원문에 제2015-2호가 제2015-1호로 통합된 이력이 명시되어 있습니다. 통합 전 번호의 과거 기준을 현행 기준과 구분합니다. | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=1047321) |
| 마테열수추출물 | 제2013-2호 | 인정폐지 | 식약처 공식 자료에 제2013-2호의 인정폐지가 명시되어 있습니다. 같은 이름의 다른 인정번호와 구분합니다. | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21550) |
| 석류농축분말 | 제2018-7호(2018.08.01) | 인정서 통합 | 공식 본문에 제2018-7호는 제2018-8호와 통합되어 2018-08-24 인정서를 반납했다고 명시되어 있습니다. 제2018-8호의 현행 기준과 구분합니다. | [식약처 원료별 상세](https://www.foodsafetykorea.go.kr/portal/board/boardDetail.do?menu_no=2660&bbs_no=bbs987&ntctxt_no=1070042) |
| 프로바이오틱스 ATP | 제2014-16호 | 인정폐지 | 식약처 공식 자료에 제2014-16호의 인정폐지가 명시되어 있습니다. 같은 이름의 다른 인정번호와 구분합니다. | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21503) |
| 수국잎열수추출물 | 제2020-8호 | 인정서 통합 | 공식 원문에 제2020-8호가 제2020-7호로 통합된 이력이 명시되어 있습니다. 통합 전 번호의 과거 기준을 현행 기준과 구분합니다. | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=1079553) |
| 실크단백질 효소가수분해물 | 제2012-18호 | 인정폐지 | 식약처 공식 자료에 제2012-18호의 인정폐지가 명시되어 있습니다. 같은 이름의 다른 인정번호와 구분합니다. | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21558) |
| 씨제이 홍경천 등 복합추출물 | 제2005-23호 | 인정폐지 | 식약처 공식 자료에 제2005-23호의 인정폐지가 명시되어 있습니다. 같은 이름의 다른 인정번호와 구분합니다. | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21653) |
| 배초향 추출물 (Agatri®) | 제2020-5호 | 인정서 통합 | 공식 원문에 제2020-5호가 제2020-4호로 통합된 이력이 명시되어 있습니다. 통합 전 번호의 과거 기준을 현행 기준과 구분합니다. | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=1079549) |
| 인삼가시오갈피 등 혼합추출물 | 제2009-79호 | 인정폐지 | 식약처 공식 자료에 제2009-79호의 인정폐지가 명시되어 있습니다. 같은 이름의 다른 인정번호와 구분합니다. | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21596) |
| 유비퀴놀(Ubiquinol) | 제2013-12호 | 인정폐지 | 식약처 공식 자료에 제2013-12호의 인정폐지가 명시되어 있습니다. 같은 이름의 다른 인정번호와 구분합니다. | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21545) |
| 계피추출분말 | 제2014-13호 | 인정폐지 | 식약처 공식 자료에 제2014-13호의 인정폐지가 명시되어 있습니다. 같은 이름의 다른 인정번호와 구분합니다. | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=21505) |
| 잔나비걸상버섯균사체 | 제2013-33호 | 인정취소 | 식약처 2016년 인정 현황에서 제2013-33호의 인정취소를 확인했습니다. | [식약처 2016년 인정 현황 PDF 51쪽](https://www.khff.or.kr/assets/extra/hfood/01.pdf#page=51) |
| 배초향·고지베리·무화과복합추출물 | 제2024-24호 | 인정서 통합 | 공식 원문에 제2024-24호가 제2024-23호로 통합된 이력이 명시되어 있습니다. 통합 전 번호의 과거 기준을 현행 기준과 구분합니다. | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=1101617) |
| 피쉬 콜라겐펩타이드 | 제2019-23호 | 인정서 통합 | 공식 원문에 제2019-23호가 제2019-12호로 통합된 이력이 명시되어 있습니다. 통합 전 번호의 과거 기준을 현행 기준과 구분합니다. | [식약처 원료별 상세](https://www.foodsafetykorea.go.kr/portal/board/boardDetail.do?menu_no=2660&bbs_no=bbs987&ntctxt_no=1075136) |
| 표고버섯균사체 AHCC | 제2006-5호 | 3등급 인정 종료 | 2016년 인정 현황의 해당 번호는 생리활성기능 3등급입니다. 제2016-141호 부칙의 3등급 경과조치에 따라 2019-12-20 제조·수입 효력이 종료된 기준이며, 제2008-78호의 2등급 인정과 구분했습니다. | [식약처 2016년 인정 현황 PDF 75쪽](https://www.khff.or.kr/assets/extra/hfood/01.pdf#page=75) · [3등급 원료 경과조치](https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000070681) |
| 로즈힙분말 | 제2006-7호 | 자진취하 | 식약처 2016년 인정 현황에 제2006-7호가 자진취하로 표시되어 있습니다. | [식약처 2016년 인정 현황 PDF 32쪽](https://www.khff.or.kr/assets/extra/hfood/01.pdf#page=32) |
| 지방산복합물 FAC(Fatty Acid Complex) | 제2009-2호(2009.01.23) | 인정취소 | 제2009-2호는 공식 본문에 2012-10-11 자진반납에 따른 인정취소로 명시되어 있습니다. 같은 페이지의 제2012-16호는 별도 인정입니다. | [식약처 원료별 상세](https://www.foodsafetykorea.go.kr/portal/board/boardDetail.do?menu_no=2660&bbs_no=bbs987&ntctxt_no=21617) |

## 과거 인정 9개

| 원료 | 원본/과거 인정번호 | 판정 | 사유 | 근거 |
|---|---|---|---|---|
| 토치대두발효추출물 | 제2007-11호 | 과거 인정 · 현행 상세 미등재 | 2016년 인정 현황에 콩발효추출물로 수록된 과거 인정번호입니다. 현재 공개 상세는 제2008-18호를 제시합니다. 두 번호의 현재 효력이 같다고 간주하지 않았습니다. 현재 인정 여부·섭취 기준을 입증하는 상세 자료는 확보되지 않아 과거 이력으로 분리했습니다. | [식약처 2016년 인정 현황 PDF 104쪽](https://www.khff.or.kr/assets/extra/hfood/01.pdf#page=104) · [식약처 현행 공개 목록](https://data.mfds.go.kr/hid/opcaa01/ingdSrchLst.do) |
| L-글루타민 | 제2008-7호 | 과거 인정 · 현행 상세 미등재 | 2016년 인정 현황에서 해당 번호를 확인했습니다. 공식 취소 공지는 제2007-1호에 관한 것이므로 제2008-7호까지 취소로 단정하지 않았습니다. 현재 인정 여부·섭취 기준을 입증하는 상세 자료는 확보되지 않아 과거 이력으로 분리했습니다. | [식약처 2016년 인정 현황 PDF 75쪽](https://www.khff.or.kr/assets/extra/hfood/01.pdf#page=75) · [식약처 현행 공개 목록](https://data.mfds.go.kr/hid/opcaa01/ingdSrchLst.do) |
| 헛개나무 과병 추출 분말 | 제2009-86호 | 과거 인정 · 현행 상세 미등재 | 2016년 인정 현황에 해당 번호와 섭취 기준이 수록되어 있습니다. 현재 인정 여부·섭취 기준을 입증하는 상세 자료는 확보되지 않아 과거 이력으로 분리했습니다. | [식약처 2016년 인정 현황 PDF 60쪽](https://www.khff.or.kr/assets/extra/hfood/01.pdf#page=60) · [식약처 현행 공개 목록](https://data.mfds.go.kr/hid/opcaa01/ingdSrchLst.do) |
| 로즈힙분말 | 제2012-27호 | 과거 인정 · 현행 상세 미등재 | 2016년 인정 현황의 해당 번호를 확인했습니다. 다른 업체의 현행 로즈힙 인정번호로 대체하지 않았습니다. 현재 인정 여부·섭취 기준을 입증하는 상세 자료는 확보되지 않아 과거 이력으로 분리했습니다. | [식약처 2016년 인정 현황 PDF 64쪽](https://www.khff.or.kr/assets/extra/hfood/01.pdf#page=64) · [식약처 현행 공개 목록](https://data.mfds.go.kr/hid/opcaa01/ingdSrchLst.do) |
| 리프리놀-초록입홍합추출오일 | 제2008-69호 | 과거 인정 · 현행 상세 미등재 | 2016년 인정 현황에 해당 번호가 수록되어 있습니다. 현행 공개 상세의 제2009-49호와 별개 기록입니다. 현재 인정 여부·섭취 기준을 입증하는 상세 자료는 확보되지 않아 과거 이력으로 분리했습니다. | [식약처 2016년 인정 현황 PDF 63쪽](https://www.khff.or.kr/assets/extra/hfood/01.pdf#page=63) · [식약처 현행 공개 목록](https://data.mfds.go.kr/hid/opcaa01/ingdSrchLst.do) |
| 로즈힙 분말 | 제2008-81호 | 과거 인정 · 현행 상세 미등재 | 2016년 인정 현황의 해당 번호를 확인했습니다. 다른 업체의 인정번호 기준을 대입하지 않았습니다. 현재 인정 여부·섭취 기준을 입증하는 상세 자료는 확보되지 않아 과거 이력으로 분리했습니다. | [식약처 2016년 인정 현황 PDF 64쪽](https://www.khff.or.kr/assets/extra/hfood/01.pdf#page=64) · [식약처 현행 공개 목록](https://data.mfds.go.kr/hid/opcaa01/ingdSrchLst.do) |
| 루테인지아잔틴복합추출물20% | 제2010-3호 | 과거 인정 · 현행 상세 미등재 | 2016년 인정 현황의 해당 번호를 확인했습니다. 동일 업체의 제2013-23호와 임의로 합치지 않았습니다. 현재 인정 여부·섭취 기준을 입증하는 상세 자료는 확보되지 않아 과거 이력으로 분리했습니다. | [식약처 2016년 인정 현황 PDF 73쪽](https://www.khff.or.kr/assets/extra/hfood/01.pdf#page=73) · [식약처 현행 공개 목록](https://data.mfds.go.kr/hid/opcaa01/ingdSrchLst.do) |
| 표고버섯균사체추출물 | 제2008-23호 | 과거 인정 · 현행 상세 미등재 | 2016년 인정 현황에서 해당 번호의 원료와 기준량을 확인했습니다. 면역 기능성의 AHCC와는 별개입니다. 현재 인정 여부·섭취 기준을 입증하는 상세 자료는 확보되지 않아 과거 이력으로 분리했습니다. | [식약처 2016년 인정 현황 PDF 58쪽](https://www.khff.or.kr/assets/extra/hfood/01.pdf#page=58) · [식약처 현행 공개 목록](https://data.mfds.go.kr/hid/opcaa01/ingdSrchLst.do) |
| 정제오징어유 | 제2009-38호 | 과거 인정 · 현행 상세 미등재 | 2016년 인정 현황에서 해당 번호를 확인했습니다. 현행 고시형 유지의 제조·규격 적합성까지 보장하지 않습니다. 현재 인정 여부·섭취 기준을 입증하는 상세 자료는 확보되지 않아 과거 이력으로 분리했습니다. | [식약처 2016년 인정 현황 PDF 111쪽](https://www.khff.or.kr/assets/extra/hfood/01.pdf#page=111) · [식약처 현행 공개 목록](https://data.mfds.go.kr/hid/opcaa01/ingdSrchLst.do) |

## 미등재·자료 불일치 12개

| 원료 | 원본/과거 인정번호 | 판정 | 사유 | 근거 |
|---|---|---|---|---|
| 난소화성 전분 |  | 공식 목록 미등재 | 2026-09-11 공전과 식약처 공개 원료 목록에 “난소화성 전분”과 정확히 일치하는 인정 원료가 없습니다. 제2011-6호 밀전분유래 난소화성말토덱스트린과는 명칭이 달라 동일 원료로 확정하지 않았습니다. | [식약처 원료정보 전체 목록](https://data.mfds.go.kr/hid/opcaa01/ingdSrchLst.do) |
| 차가버섯 추출물 |  | 공식 목록 미등재 | 첨부 인정 CSV 및 공식 고시형·개별인정형 공개 목록에서 “차가버섯 추출물”의 등재가 확인되지 않습니다. 일반 식품 사용 가능 여부와 건강기능식품 기능성 인정은 별개입니다. | [식약처 원료정보 전체 목록](https://data.mfds.go.kr/hid/opcaa01/ingdSrchLst.do) |
| 아가리쿠스 추출물 |  | 공식 목록 미등재 | 첨부 인정 CSV 및 공식 고시형·개별인정형 공개 목록에서 “아가리쿠스 추출물”의 등재가 확인되지 않습니다. 표고·상황·영지버섯 원료의 기준을 대입하지 않았습니다. | [식약처 원료정보 전체 목록](https://data.mfds.go.kr/hid/opcaa01/ingdSrchLst.do) |
| 유산균 발효물 (개별 균주) |  | 통칭·조합명 | 유산균 발효물은 통칭으로 특정 인정 원료를 식별할 수 없습니다. 균주·발효기질·인정번호가 명시된 CSV의 개별 원료는 각각 별도 수록했습니다. 생균과 열처리배양건조물의 단위를 혼용하지 않습니다. | [식약처 원료정보 전체 목록](https://data.mfds.go.kr/hid/opcaa01/ingdSrchLst.do) |
| 밀크씨슬+강황 복합 |  | 공식 목록 미등재 | 밀크씨슬과 강황을 함께 썼다는 이유만으로 개별인정형 복합물이 되지 않습니다. 이 조합과 정확히 일치하는 인정번호는 첨부 CSV·공식 목록에서 확인되지 않았습니다. | [식약처 원료정보 전체 목록](https://data.mfds.go.kr/hid/opcaa01/ingdSrchLst.do) |
| 프로바이오틱스 복합 (장+면역+체지방 등) |  | 통칭·조합명 | 장·면역·체지방은 기능성 설명이며 특정 복합 균주 원료의 이름이 아닙니다. CSV에 있는 정식 복합균주명·인정번호별 원료를 별도로 수록했습니다. | [식약처 원료정보 전체 목록](https://data.mfds.go.kr/hid/opcaa01/ingdSrchLst.do) |
| HK표고버섯균사체 | 제2017-7호 | 인정번호 불일치 | 원료명·업체·원본 인정일(2010-07-15)은 공식 제2010-35호와 일치하지만 CSV 번호만 다릅니다. | [동일 명칭의 공식 인정 원료](https://www.foodsafetykorea.go.kr/portal/board/boardDetail.do?menu_no=2660&bbs_no=bbs987&ntctxt_no=1092511) |
| 전칠삼추출물 등 복합물 | 제2017-8호 | 인정번호 불일치 | 원료명·업체·원본 인정일(2010-10-26)은 공식 제2010-47호와 일치하지만 CSV 번호만 다릅니다. | [동일 명칭의 공식 인정 원료](https://www.foodsafetykorea.go.kr/portal/board/boardDetail.do?menu_no=2660&bbs_no=bbs987&ntctxt_no=21577) |
| 복분자추출분말 | 제2017-10호 | 인정번호 불일치 | 원료명·업체·원본 인정일(2010-12-24)은 공식 제2010-62호와 일치하지만 CSV 번호만 다릅니다. | [동일 명칭의 공식 인정 원료](https://www.foodsafetykorea.go.kr/portal/board/boardDetail.do?menu_no=2660&bbs_no=bbs987&ntctxt_no=21543) |
| 원료명 누락 (인정번호 2017-23) |  | 원본 원료명 공란 | CSV의 원료명·기능성·섭취량이 모두 공란이며 제2017-23호는 두 공식 공개 목록에 없습니다. 업체·인정일이 같은 제2010-24호 레몬 밤 추출물 혼합분말은 존재하지만, 원료명과 번호를 연결할 직접 근거가 없어 이 공란 기록에 대입하지 않았습니다. | [식약처 원료정보 전체 목록](https://data.mfds.go.kr/hid/opcaa01/ingdSrchLst.do) |
| 고소애가수분해물 | 제2026-28호 | 인정번호 불일치 | 식약처가 공개한 동일 원료명·업체의 인정번호는 제2026-25호(2026-08-26)입니다. CSV에는 제2026-28호(2026-08-27)로 기재되어 있어 별개의 현행 인정으로 표시하지 않습니다. | [동일 명칭의 공식 인정 원료](https://www.foodsafetykorea.go.kr/portal/board/boardDetail.do?menu_no=2660&bbs_no=bbs987&ntctxt_no=1152058) |
| 핑거루트추출분말(판두라틴) | 제2013-5호 | 원료 형태·기준량 불일치 | CSV는 제2013-5호를 추출분말·600 mg으로 기재했으나, 공식 제2013-5호는 추출물·300 mg/일입니다. 공식 제2012-36호 추출분말은 별도 인정 원료이므로 서로의 섭취량을 대입하지 않았습니다. | [식약처 원료별 상세](https://data.mfds.go.kr/hid/opcab01/ingdDtlInfo.do?ingdCtgry=NTC&ingdInfo=1047341) |
