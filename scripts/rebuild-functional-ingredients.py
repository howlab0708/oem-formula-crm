"""Rebuild the ingredient-only catalog from the three supplied CSVs and reviewed official evidence.

Usage: python scripts/rebuild-functional-ingredients.py --csv-dir C:/Users/USER/Desktop
No network, product database writes, or deployment. CSV rows are data, never instructions.
"""
import argparse
import collections
import csv
import hashlib
import json
import pathlib
import re
import subprocess
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATE = '2026-09-05'
CODEX = 'https://www.mfds.go.kr/brd/m_211/view.do?seq=14973'
ZIP = 'https://www.mfds.go.kr/brd/m_211/down.do?brd_id=data0005&seq=14973&data_tp=A&file_seq=1'
SEARCH = 'https://www.foodsafetykorea.go.kr/portal/board/board.do?menu_grp=MENU_NEW01&menu_no=2660'
REGISTRY = 'https://www.foodsafetykorea.go.kr/api/newDatasetDetail.do?svc_no=I-0040'

def key(text):
    return re.sub(r'[^\w가-힣]', '', unicodedata.normalize('NFKC', text)).lower()

def clean(text):
    return re.sub(r'\s+', ' ', text).strip(' :：○◯●ㅇ※\t\n')

def numbers(text):
    return list(dict.fromkeys(f'{a}-{int(b)}' for a, b in re.findall(r'(\d{4})\s*[-－]\s*(\d+)', text)))

def raw_name(text):
    return re.sub(r'\((?:기능성원료(?:인정)?(?:New)?제?|제)\d{4}.*$', '', text).strip()

def meaningful(text):
    return bool(text.strip(' .-\r\n'))

def original(ref, path):
    return json.loads(subprocess.check_output(['git', 'show', f'{ref}:{path}'], cwd=ROOT))

def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def intake(text, functionality, default_basis):
    # Keep the whole authoritative clause: never manufacture one combined numeric range.
    clauses = [clean(s) for s in re.split(r'\([가나다라마바사]\)', text) if clean(s)]
    result = []
    for clause in clauses:
        purpose, amount = functionality, clause
        if ':' in clause:
            purpose, amount = [clean(s) for s in clause.split(':', 1)]
        match = re.search(r'(.+?)(?:으로서|로서)\s*(.*)', amount)
        basis = match[1].strip() if match else default_basis
        result.append({'purpose': purpose, 'amount': amount, 'basis': basis})
    return result

def new_entry(id, name, category, standards, note=''):
    return {'id': id, 'sourceIds': [], 'name': name, 'category': category, 'standards': standards,
            'note': note, 'upcoming': [], 'reviewedOn': DATE}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--csv-dir', type=pathlib.Path, default=ROOT)
    parser.add_argument('--baseline-ref', default='471948e7b7d0ec66b7cfa5cc3e483eff2f37b49d')
    args = parser.parse_args()
    evidence = json.loads((ROOT / 'docs/functional-ingredient-evidence.json').read_text(encoding='utf-8'))
    catalog = original(args.baseline_ref, 'src/data/functionalIngredients.json')
    source = original(args.baseline_ref, 'src/data/functionalIngredients.source.json')
    for row in source:
        row.update(sourceFile='기존 원료 목록', row=row.pop('line'), recognition='', holder='', raw={})
    csvs, files = {}, []
    for filename, expected in [('C003.csv', 45996), ('I-0040.csv', 773), ('I-0050.csv', 447)]:
        path = args.csv_dir / filename
        with path.open(encoding='utf-8-sig', newline='') as file:
            rows = list(csv.DictReader(file))
        assert len(rows) == expected, (filename, len(rows))
        assert all(None not in row and None not in row.values() for row in rows)
        csvs[filename] = rows
        files.append({'name': filename, 'rows': len(rows), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})

    by_id = {entry['id']: entry for entry in catalog}
    official = {n: row for row in evidence['recognized'] for n in row['numbers']}
    official_title = {n: row for row in evidence['recognized'] for n in numbers(row['title'])}
    codex = {row['section']: row for row in evidence['codex']}
    # Existing reviewed display entries keep their IDs and function-specific amount formatting.
    baseline_sections = {
        '1-14': 1, '1-3': 2, '1-1': 3, '1-10': 4, '1-8': 5, '1-15': 6, '1-16': 7,
        '1-18': 8, '1-20': 9, '1-17': 10, '2-16': 11, '2-30': 14, '2-55': 15,
        '2-31': 16, '2-26': 17, '2-14': 18, '2-57': 19, '2-9': 21, '2-2': 22,
        '2-51': 23, '2-50': 24, '2-25': 25, '2-24': 26, '2-6': 27, '2-8': 28,
        '2-47': 29, '2-60': 30, '2-10': 31, '2-27': 32, '2-18': 33, '2-32': 34,
        '2-59': 44, '2-28': 53, '2-36': 64,
    }
    notified = {}
    for section, row in codex.items():
        if section in baseline_sections:
            entry = by_id[f'ingredient-{baseline_sections[section]:02}']
        else:
            standard = {'name': row['name'], 'recognition': '', 'holder': '', 'functionality': row['functionality'],
                        'intakes': intake(row['intake'], row['functionality'], row['name']),
                        'sourceUrl': ZIP, 'sourcePageUrl': CODEX, 'sourceLabel': '건강기능식품공전 ' + section,
                        'caution': row['caution'] or '해당 공전 항목에 별도 섭취 시 주의사항 표기 없음. 제조기준·규격은 원문 확인.'}
            entry = new_entry('codex-' + section, row['name'], 'notified', [standard])
            catalog.append(entry)
        entry['codexSection'] = section
        if row['upcoming'] and not entry['upcoming']:
            entry['upcoming'] = [{'effectiveOn': '2027-01-01', 'text': '이 원료 항목의 개정 기준이 시행됩니다. 상세 제조기준·기능성·섭취량·주의사항은 공전의 시행 예정 부분을 확인하세요.'}]
        if section == '2-48':
            entry['upcoming'] = [{'effectiveOn': '2027-01-01', 'text': '영지버섯 자실체 추출물의 고시형 원료 항목이 삭제됩니다. 개별인정형 영지버섯균사체추출분말과는 별개 원료입니다.'}]
        notified[section] = entry

    # Reviewed historical trade names. These aliases only relate the old CSV record to the
    # current codex entry; old approval doses/functionality are never promoted to codex standards.
    aliases = {
        '2-1': ['인삼', '인삼추출물'], '2-5': ['스피루리나원말'], '2-6': ['녹차추출물', 'TEAVIGO (고순도 녹차 EGCG 90%)'],
        '2-9': ['KANEKA Q10', 'Kaneka Q10', '미쯔비시 코엔자임Q10', '미쯔비시 코엔자임 Q10', '동우코엔자임Q10', '수용화 코큐텐 분말 ALL-Q'],
        '2-10': ['Novasoy', '쏘이라이프(Soylife)', '대두이소플라본 추출물 분말', '대두이소플라본추출물', '아글리맥스(AglyMax) 30 이소플라본추출물', '피토쏘야(Phyto soya)'],
        '2-11': ['구아바잎', '구아바잎추출물'], '2-12': ['바나바주정추출물'],
        '2-14': ['밀크씨슬추출물', '밀크씨슬 추출물(Milk Thistle Extract)'],
        '2-15': ['탈지달맞이꽃종자주정추출물'],
        '2-16': ['EPA & DHA 함유 유지', 'EPA 및 DHA 함유 유지(고시형 원료)', '오메가-3 지방산 함유 유지'],
        '2-26': ['루테인', 'FloraGLO Lutein(20% liquid in safflower oil)', 'Free Lutein 복합물(Lutein 20% FS)', 'Lutein20%(Parry Xanmax 20%)', '루테인복합물 SF20', '루테인복합물VBAF', '루테인추출물20%', '루테인추출복합물OS20', '루테인추출복합분말CWD10'],
        '2-27': ['내츄럴아스타잔틴컴플렉스', '헤마토코쿠스 CO2 초임계 추출물'],
        '2-28': ['쏘우팔메토열매추출물(SAW PALMETTO EXTRACT OIL)', '쏘팔메토 (Saw Palmetto) 열매 추출물', '쏘팔메토 열매 초임계추출물', '쏘팔메토 열매 추출물(Palmetto RossoTM)'],
        '2-29': ['대두 포스파티딜세린(Leci-PS)', '포스파티딜세린(LECI-PS 90 PN IP)'],
        '2-33': ['구아검가수분해물(Sunfiberⓡ)'], '2-49': ['키토산', '키토올리고당'],
        '2-50': ['액상 프락토올리고당'], '2-54': ['L-테아닌', '썬테아닌', '테아닌(Theanine)'],
        '2-55': ['MSM', 'Dimethylsulfone (MSM)', 'Methyl Slufonyl Methane(MSM)', 'Opti MSM', 'Rain Nutrience DistilPureTM MSM'],
        '2-56': ['Ca-PGA'], '2-57': ['히알루론산나트륨', '히알루론산나트륨(HA-LF-P)', '히알우론산 HA-LF-P', '히알우론산나트륨'],
        '2-58': ['홍경천추출물 KH101'], '2-59': ['빌베리주정추출물'],
        '2-64': ['유단백가수분해물(락티움)'], '2-65': ['금사상황버섯'],
        '2-67': ['곤약감자추출분말'], '2-69': ['콜레우스 포스콜리 추출물 Forslean'],
    }
    notified_names = {key(row['name']): notified[section] for section, row in codex.items()}
    for section, names in aliases.items():
        for name in names:
            notified_names[key(name)] = notified[section]
    for row in csvs['I-0040.csv']:
        name = row['APLC_RAWMTRL_NM']
        if '가르시니아' in name and not any(s in name for s in ['복합', '혼합']):
            notified_names[key(name)] = notified['2-25']
        if re.search(r'\bCLA\b|공액리놀', name, re.I):
            notified_names[key(name)] = notified['2-24']

    recognized = {n: entry for entry in catalog if entry['category'] == 'recognized'
                  for standard in entry['standards'] for n in numbers(standard['recognition'])}
    # Old IDs that were reused in CSV namespaces must not join to a different current material.
    collision_names = {('2007-10', key('글루코사민')), ('2007-13', key('크레아틴'))}
    provenance = collections.defaultdict(list)
    repairs = []
    for filename in ['I-0040.csv', 'I-0050.csv']:
        for index, raw in enumerate(csvs[filename], 1):
            is40 = filename == 'I-0040.csv'
            name = raw_name(raw['APLC_RAWMTRL_NM'] if is40 else raw['RAWMTRL_NM'])
            ns = numbers(raw['HF_FNCLTY_MTRAL_RCOGN_NO'])
            number = ns[0] if ns else ''
            if not number and key(name) == key('풋사과농축분말(APPLOZIN)'):
                number = '2024-4'
                repairs.append({'file': filename, 'row': index, 'reason': '인정번호 공란 → 제2024-4호. 공식 원료명 및 한국씨엔에스팜 대조.'})
            # The CSV has powder (600 mg) and extract (300 mg) under 2013-5. The
            # current extract page does not prove the powder's dose; keep them separate.
            variant = number == '2013-5' and '추출분말' in name
            approval_key = number + ('-powder' if variant else '')
            board = official.get(number) if (number, key(name)) not in collision_names and not variant else None
            if not name and board:
                name = board['원료명']
                repairs.append({'file': filename, 'row': index, 'reason': f'원료명 공란 → {name}. 인정번호 {number} 대조.'})
            row = {'id': f'{filename[:-4].lower()}-{index:04}', 'sourceFile': filename, 'row': index,
                   'category': '원료 인정 현황' if is40 else '개별인정형 정보', 'name': name or '원료명 누락',
                   'recognition': raw['HF_FNCLTY_MTRAL_RCOGN_NO'], 'holder': raw.get('BSSH_NM', ''),
                   'functionality': raw.get('FNCLTY_CN', raw.get('PRIMARY_FNCLTY', '')),
                   'dailyIntake': raw.get('DAY_INTK_CN', f"하한 {raw.get('DAY_INTK_LOWLIMIT', '')} / 상한 {raw.get('DAY_INTK_HIGHLIMIT', '')} / 단위 {raw.get('WT_UNIT', '')}"),
                   'raw': raw}
            source.append(row)
            entry = None
            if board:
                entry = recognized.get(approval_key)
                if entry is None:
                    standard = {'name': board['원료명'], 'recognition': board['인정번호'], 'holder': board['업체명'],
                                'functionality': board['기능성내용'],
                                'intakes': intake(board['일일섭취량'], board['기능성내용'], '공식 원문의 원료·지표성분 기준'),
                                'sourceUrl': SEARCH.replace('board.do?menu_grp=MENU_NEW01&menu_no=2660', 'boardDetail.do?menu_no=2660&bbs_no=bbs987&ntctxt_no=' + board['id']),
                                'sourceLabel': '식품안전나라 개별인정 원료',
                                'caution': board.get('섭취시주의사항') or '공개 게시물에 별도 표기 없음. 해당 원료 인정서 확인 필요.'}
                    entry = new_entry('recognized-' + number, board['원료명'], 'recognized', [standard], '인정번호가 일치하는 식품안전나라 공식 게시물의 기준입니다. 원료명·업체·제조규격이 같은 원료에 적용합니다.')
                    catalog.append(entry)
                    recognized[number] = entry
                entry['evidenceStatus'] = 'official'
            elif key(name) in notified_names:
                entry = notified_names[key(name)]
                entry['historicalRecognition'] = True
            elif name and number:
                entry = recognized.get(approval_key)
                if entry is None:
                    # Registry evidence identifies the approval, but does not establish today's
                    # complete standard. Missing/zero I-0050 bounds are not inferred as a dose.
                    related = official_title.get(number)
                    standard = {'name': name, 'recognition': f'제{number}호', 'holder': raw.get('BSSH_NM', '') or '공개 자료에서 업체 확인 필요',
                                'functionality': row['functionality'] if meaningful(row['functionality']) else '기능성 원문 확인 필요',
                                'intakes': [], 'sourceUrl': REGISTRY, 'sourceLabel': '식품안전나라 원료인정현황',
                                'caution': raw.get('IFTKN_ATNT_MATR_CN') or '공개 자료에서 주의사항 확인 필요'}
                    if related:
                        standard['sourceUrl'] = SEARCH.replace('board.do?menu_grp=MENU_NEW01&menu_no=2660', 'boardDetail.do?menu_no=2660&bbs_no=bbs987&ntctxt_no=' + related['id'])
                        standard['sourceLabel'] = '식품안전나라 인정 이력'
                    entry = new_entry('registry-' + approval_key, name, 'recognized', [standard], '첨부 CSV의 개별인정 이력입니다. 공식 상세에서 이 인정번호의 현재 섭취 기준 전체를 확인하지 못해 현행 섭취량을 확정하지 않았습니다. CSV 원문 수치와 인정서를 대조하세요.')
                    if variant:
                        entry['note'] = '제2013-5호에 추출분말(600 mg)과 추출물(300 mg)이 함께 기재되어 있습니다. 공식 게시물의 300 mg은 추출물 기준이므로 추출분말에 대입하지 않았습니다. 원료 제조규격과 인정서 확인이 필요합니다.'
                    entry['evidenceStatus'] = 'registry'
                    catalog.append(entry)
                    recognized[approval_key] = entry
                if is40 and meaningful(row['dailyIntake']):
                    entry['standards'][0]['recordedIntake'] = row['dailyIntake']
                if not meaningful(entry['standards'][0]['functionality']) or entry['standards'][0]['functionality'] == '기능성 원문 확인 필요':
                    if meaningful(row['functionality']):
                        entry['standards'][0]['functionality'] = row['functionality']
            else:
                entry = new_entry('unresolved-' + row['id'], f'원료명 누락 (인정번호 {number or "공란"})', 'unresolved', [], 'I-0040 원료명·기능성·섭취량이 비어 있으며, I-0050 및 공식 공개 원료 목록에서도 일치하는 인정번호를 확인하지 못했습니다. 업체가 같다는 이유로 다른 원료의 이름·섭취량을 대입하지 않았습니다.')
                catalog.append(entry)
            entry['sourceIds'].append(row['id'])
            provenance[entry['id']].append((row, number))

    unresolved_notes = {
        70: '첨부 인정 CSV 및 공식 목록에 “난소화성 전분”과 정확히 일치하는 인정 원료가 없습니다. 제2011-6호 밀전분유래 난소화성말토덱스트린과는 명칭이 달라 동일 원료로 확정하지 않았습니다.',
        71: '첨부 인정 CSV 및 공식 고시형·개별인정형 공개 목록에서 “차가버섯 추출물”의 일치 원료를 찾지 못했습니다. 일반 식품 사용 가능 여부와 건강기능식품 기능성 인정은 별개입니다.',
        73: '첨부 인정 CSV 및 공식 고시형·개별인정형 공개 목록에서 “아가리쿠스 추출물”의 일치 원료를 찾지 못했습니다. 표고·상황·영지버섯 원료의 기준을 대입하지 않았습니다.',
        74: '유산균 발효물은 통칭으로 특정 인정 원료를 식별할 수 없습니다. 균주·발효기질·인정번호가 명시된 CSV의 개별 원료는 각각 별도 수록했습니다. 생균과 열처리배양건조물의 단위를 혼용하지 않습니다.',
        77: '밀크씨슬과 강황을 함께 썼다는 이유만으로 개별인정형 복합물이 되지 않습니다. 이 조합과 정확히 일치하는 인정번호는 첨부 CSV·공식 목록에서 확인되지 않았습니다.',
        78: '장·면역·체지방은 기능성 설명이며 특정 복합 균주 원료의 이름이 아닙니다. CSV에 있는 정식 복합균주명·인정번호별 원료를 별도로 수록했습니다.',
    }
    for number, note in unresolved_notes.items():
        by_id[f'ingredient-{number:02}']['note'] = note
    # A number may refer to multiple old materials. Exclude all such numbers from product
    # evidence rather than attributing a product to the wrong ingredient.
    owners = collections.defaultdict(set)
    for entry in catalog:
        for _, number in provenance[entry['id']]:
            if number:
                owners[number].add(entry['id'])
    product_index = collections.defaultdict(set)
    for product in csvs['C003.csv']:
        for number in numbers(product['RAWMTRL_NM']):
            product_index[number].add(product['PRDLST_REPORT_NO'])
    excluded = sorted(number for number, entries in owners.items() if len(entries) > 1)
    for entry in catalog:
        linked = set()
        for _, number in provenance[entry['id']]:
            if number not in excluded:
                linked.update(product_index[number])
        entry['productEvidence'] = {'count': len(linked), 'examples': sorted(linked)[:3]}
        if entry.get('historicalRecognition'):
            entry['note'] += ' 첨부 CSV의 과거 개별인정 이력은 원문에 보존했습니다. 화면의 고시형 기준은 현행 공전 조건을 충족하는 원료에 적용하며 과거 승인량을 현행 기준으로 사용하지 않습니다.'
    assert len(source) == 1298
    ids = [id for entry in catalog for id in entry['sourceIds']]
    assert len(ids) == len(set(ids)) == len(source)
    assert set(ids) == {row['id'] for row in source}
    summary = {'reviewedOn': DATE, 'files': files, 'legacyRows': 78, 'approvalCsvRows': 1220,
               'officialBoardPosts': 655, 'codexCount': 96,
               'counts': dict(collections.Counter(entry['category'] for entry in catalog)),
               'registryOnlyCount': sum(entry.get('evidenceStatus') == 'registry' for entry in catalog),
               'repairs': repairs, 'productEvidenceExcludedNumbers': excluded,
               'uniqueProductReports': len({row['PRDLST_REPORT_NO'] for row in csvs['C003.csv']})}
    save(ROOT / 'src/data/functionalIngredients.json', catalog)
    save(ROOT / 'src/data/functionalIngredients.source.json', source)
    save(ROOT / 'src/data/functionalIngredients.audit.json', summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
