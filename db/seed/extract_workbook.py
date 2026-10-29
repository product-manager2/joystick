"""Regenerate illustrative mission briefs from seed/joystick-seed-data.xlsx.

Only briefs and clearly labeled examples are exported. Workbook headcounts,
progress, prizes, identity claims, and reviews are never live account records.
Run from the repository root: python3 db/seed/extract_workbook.py
"""
from __future__ import annotations
import json
import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'seed/joystick-seed-data.xlsx'
DEST = ROOT / 'db/seed/mission-catalog.json'
N = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'


def sheets(path: Path) -> dict[str, list[dict[str, str]]]:
    with zipfile.ZipFile(path) as z:
        strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            strings = [''.join(t.text or '' for t in si.iter(N + 't')) for si in ET.fromstring(z.read('xl/sharedStrings.xml'))]
        book = ET.fromstring(z.read('xl/workbook.xml'))
        rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        paths = {r.attrib['Id']: r.attrib['Target'].lstrip('/') for r in rels}
        result = {}
        for sheet in book.find(N + 'sheets'):
            target = paths[sheet.attrib[R + 'id']]
            if not target.startswith('xl/'):
                target = 'xl/' + target
            tree = ET.fromstring(z.read(target))
            grid = []
            for row in tree.findall('.//' + N + 'sheetData/' + N + 'row'):
                values = {}
                for cell in row.findall(N + 'c'):
                    col = re.match(r'[A-Z]+', cell.attrib['r']).group()
                    raw = cell.find(N + 'v')
                    if cell.attrib.get('t') == 'inlineStr':
                        raw = cell.find(N + 'is/' + N + 't')
                    value = raw.text if raw is not None and raw.text is not None else ''
                    if cell.attrib.get('t') == 's' and value:
                        value = strings[int(value)]
                    values[col] = value
                grid.append(values)
            headers = grid[0] if grid else {}
            result[sheet.attrib['name']] = [{header: row.get(col, '') for col, header in headers.items()} for row in grid[1:]]
        return result


def number(value: str, default: int = 1) -> int:
    try:
        return max(1, int(float(value)))
    except (ValueError, TypeError):
        return default


def main():
    data = sheets(SOURCE)
    older = {m['id']: m for m in json.loads(DEST.read_text())} if DEST.exists() else {}
    categories = {'Health': ('Science', 'helix', 'var(--pink)'), 'AI': ('Product', 'cube', 'var(--gold)'), 'Planet': ('Planet', 'wave', 'var(--sky)'), 'Learning': ('Education', 'book', 'var(--leaf)'), 'Society': ('Community', 'spark', 'var(--blue)')}
    finished = {r['Mission ID']: r for r in data['Finished']}
    missions = []
    for row in data['Missions']:
        key = row['Mission ID']
        tag, glyph, color = categories.get(row['Section'], ('Community', 'spark', 'var(--blue)'))
        old = older.get(key, {})
        stages = sorted((s for s in data['Stages'] if s['Mission ID'] == key), key=lambda s: number(s['#']))
        plans = [s for s in data['Squads'] if s['Mission ID'] == key]
        quests = [q for q in data['Quests'] if q['Mission ID'] == key]
        older_quests = {q['id']: q for q in old.get('quests', [])}
        result = {
            'id': key, 'title': row['Title'], 'pitch': row['One-line pitch'],
            'tag': tag, 'glyph': glyph, 'color': color,
            'rules': old.get('rules', []),
            'seedNotice': 'Illustrative workbook mission. People, progress, prizes, and outcomes shown as examples are not verified live activity.',
            'stages': [{'name': s['Stage'], 'goal': s['Goal (countable)'], 'target': number(s['Target']), 'unit': s['Unit'] or 'results', 'plainWords': s['In plain words']} for s in stages],
            'strategies': [{'id': s['Squad ID'], 'name': s['Plan'], 'squad': s['Squad'], 'bet': s['The bet'], 'color': color, 'sampleStatus': s['State'], 'sampleBlocker': s['Main blocker']} for s in plans],
            'quests': [{'id': q['Quest ID'], 'title': q['Quest'], 'role': q['Role'].lower() or 'user', 'size': q['Size'] if q['Size'] in ('S', 'M', 'L') else 'S', 'xp': 0, 'coins': 0, 'strat': q['Squad ID'], 'call': older_quests.get(q['Quest ID'], {}).get('call'), 'sampleReward': q['Reward'], 'sampleCurrency': q['Currency'], 'safetyNote': q['Safety note']} for q in quests],
            'sample': {
                'state': row['State'], 'teachingPoint': row['What a visitor learns'],
                'creator': row['Creator'], 'creatorDescription': row['Creator is…'],
                'place': row['Where'], 'prize': row['Prize'], 'currency': row['Currency'],
                'players': row['Players'], 'squads': row['Squads'],
                'finished': finished.get(key),
                'people': [{k: p[k] for k in ('Name', 'Agent', 'City', 'Country', 'Main role', 'Bio (one line)', 'Squad', 'Type')} for p in data['People'] if any(p['Squad'] == s['Squad'] for s in plans)],
                'inviteExamples': [{k: inv[k] for k in ('From', 'To', 'Kind', 'Message', 'When it shows')} for inv in data['Invites'] if inv['Mission ID'] == key],
            },
        }
        missions.append(result)
    DEST.write_text(json.dumps(missions, indent=2, ensure_ascii=False) + '\n')
    print(f'Wrote {len(missions)} missions, {sum(len(m["stages"]) for m in missions)} stages, {sum(len(m["strategies"]) for m in missions)} plans, {sum(len(m["quests"]) for m in missions)} quests')

if __name__ == '__main__':
    main()
