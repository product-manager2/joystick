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
HISTORY = ROOT / 'db/seed/catalog-history.json'
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


# Workbook role names -> app role keys (Storyteller is stored as 'champion')
ROLE_KEYS = {'storyteller': 'champion'}


def bullets(value: str) -> list[str]:
    return [re.sub(r'^(•|\d+\.)\s*', '', x).strip() for x in (value or '').split('\n') if x.strip()]


def call_of(q: dict, old: dict):
    if q.get('Decision mid-quest'):
        return {'q': q['Decision mid-quest'], 'opts': [o.strip() for o in q.get('Options', '').split('|') if o.strip()]}
    return old.get('call')


def remember(history: dict, catalog: list[dict]) -> dict:
    """Record every value the catalog has shipped, so the server can tell an untouched seeded row from an edited one."""
    def add(bucket: dict, field: str, value):
        values = bucket.setdefault(field, [])
        if value not in values:
            values.append(value)
    for m in catalog:
        h = history.setdefault(m['id'], {'mission': {}, 'stages': {}, 'plans': {}, 'quests': {}})
        for field in ('title', 'pitch', 'rules'):
            add(h['mission'], field, m.get(field))
        for i, st in enumerate(m.get('stages', [])):
            for field in ('name', 'goal', 'target', 'unit'):
                add(h['stages'].setdefault(str(i), {}), field, st.get(field))
        for pl in m.get('strategies', []):
            for field in ('name', 'squad', 'bet'):
                add(h['plans'].setdefault(pl['id'], {}), field, pl.get(field))
        for q in m.get('quests', []):
            for field in ('title', 'role', 'size'):
                add(h['quests'].setdefault(q['id'], {}), field, q.get(field))
            # The first catalog had no stage numbers; those quests were all seeded into stage 1.
            add(h['quests'][q['id']], 'stage', q.get('stage') or 1)
    return history


def main():
    data = sheets(SOURCE)
    older = {m['id']: m for m in json.loads(DEST.read_text())} if DEST.exists() else {}
    categories = {'Health': ('Science', 'helix', 'var(--pink)'), 'AI': ('Product', 'cube', 'var(--gold)'), 'Planet': ('Planet', 'wave', 'var(--sky)'), 'Learning': ('Education', 'book', 'var(--leaf)'), 'Society': ('Community', 'spark', 'var(--tangerine)')}
    finished = {r['Mission ID']: r for r in data['Finished']}
    role_map = {(r['Mission ID'], r['#']): {k: v for k, v in r.items() if k not in ('Mission ID', '#', 'Stage', 'Status') and v} for r in data.get('Role map', [])}
    missions = []
    for row in data['Missions']:
        key = row['Mission ID']
        tag, glyph, color = categories.get(row['Section'], ('Community', 'spark', 'var(--tangerine)'))
        old = older.get(key, {})
        stages = sorted((s for s in data['Stages'] if s['Mission ID'] == key), key=lambda s: number(s['#']))
        plans = [s for s in data['Squads'] if s['Mission ID'] == key]
        quests = [q for q in data['Quests'] if q['Mission ID'] == key]
        older_quests = {q['id']: q for q in old.get('quests', [])}
        result = {
            'id': key, 'title': row['Title'], 'pitch': row['One-line pitch'],
            'tag': tag, 'glyph': glyph, 'color': color,
            'rules': bullets(row.get('Rules', '')) or old.get('rules', []),
            'seedNotice': 'Illustrative workbook mission. People, progress, prizes, and outcomes shown as examples are not verified live activity.',
            'stages': [{'name': s['Stage'], 'goal': s['Goal (countable)'], 'target': number(s['Target']), 'unit': s['Unit'] or 'results', 'plainWords': s['In plain words'], 'tracks': bullets(s.get('Workstreams', '')), 'why': s.get('Why this stage', ''), 'howItFits': s.get('How the roles fit together', ''), 'doneWhen': s.get('Done when', ''), 'approves': s.get('Who approves', ''), 'roles': role_map.get((key, s['#']), {}), 'sampleStatus': s.get('Status', '')} for s in stages],
            'strategies': [{'id': s['Squad ID'], 'name': s['Plan'], 'squad': s['Squad'], 'bet': s['The bet'], 'color': color, 'sampleStatus': s['State'], 'sampleBlocker': s['Main blocker'], 'howItWorks': bullets(s.get('How the plan works', '')), 'rolesNeeded': s.get('Roles needed', ''), 'relations': s.get('Relations', '')} for s in plans],
            'quests': [{'id': q['Quest ID'], 'title': q['Quest'], 'role': ROLE_KEYS.get(q['Role'].lower(), q['Role'].lower()) or 'user', 'size': q['Size'] if q['Size'] in ('S', 'M', 'L') else 'S', 'xp': 0, 'coins': 0, 'strat': q['Squad ID'], 'call': call_of(q, older_quests.get(q['Quest ID'], {})), 'sampleReward': q['Reward'], 'sampleCurrency': q['Currency'], 'safetyNote': q['Safety note'],
                        'stage': number(q.get('Stage #', ''), 0) or None, 'sampleState': q.get('State', ''), 'where': q.get('Where', ''), 'fit': q.get('Good for you if…', ''), 'dependsOn': [d.strip() for d in q.get('Depends on', '').split(',') if d.strip()],
                        'detail': {'brief': q.get('Brief', ''), 'steps': bullets(q.get('Steps', '')), 'handIn': q.get('You hand in', ''), 'doneWhen': q.get('Done when', ''), 'checkedBy': q.get("How it's checked", ''), 'agentDoes': q.get('Your agent does', ''), 'humanDoes': q.get('You do', ''), 'tools': q.get('Tools & data', ''), 'skills': q.get('Skills', '')}} for q in quests],
            'sample': {
                'state': row['State'], 'teachingPoint': row['What a visitor learns'],
                'detail': {'problem': row.get('The problem today', ''), 'whoItHelps': row.get('Who it helps', ''), 'whyUnsolved': row.get("Why it isn't solved yet", ''), 'winning': bullets(row.get('What winning looks like', '')), 'hardParts': bullets(row.get('Hard parts', '')), 'partners': bullets(row.get('Partners needed', '')), 'dataTools': bullets(row.get('Data, laws & tools', '')), 'timeline': row.get('Timeline', '')},
                'budget': [b for b in data.get('Budget', []) if b['Mission ID'] == key],
                'risks': [r for r in data.get('Risks', []) if r['Mission ID'] == key],
                'facts': [f for f in data.get('Facts', []) if f['Mission ID'] == key],
                'creator': row['Creator'], 'creatorDescription': row['Creator is…'],
                'place': row['Where'], 'prize': row['Prize'], 'currency': row['Currency'],
                'players': row['Players'], 'squads': row['Squads'],
                'finished': finished.get(key),
                'people': [{k: p[k] for k in ('Name', 'Agent', 'City', 'Country', 'Main role', 'Bio (one line)', 'Squad', 'Type')} for p in data['People'] if any(p['Squad'] == s['Squad'] for s in plans)],
                'inviteExamples': [{k: inv[k] for k in ('From', 'To', 'Kind', 'Message', 'When it shows')} for inv in data['Invites'] if inv['Mission ID'] == key],
            },
        }
        missions.append(result)
    history = json.loads(HISTORY.read_text()) if HISTORY.exists() else {}
    if older:
        remember(history, list(older.values()))
    HISTORY.write_text(json.dumps(remember(history, missions), indent=1, ensure_ascii=False) + '\n')
    DEST.write_text(json.dumps(missions, indent=2, ensure_ascii=False) + '\n')
    print(f'Wrote {len(missions)} missions, {sum(len(m["stages"]) for m in missions)} stages, {sum(len(m["strategies"]) for m in missions)} plans, {sum(len(m["quests"]) for m in missions)} quests')

if __name__ == '__main__':
    main()
