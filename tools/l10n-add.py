"""Adds translations to l10n/de.json and l10n/de_DE.json: python3 tools/l10n-add.py < entries.json
Input: {"key": "informal" | ["singular", "plural"] | {"de": ..., "de_DE": ...}}"""
import json
import sys

entries = json.load(sys.stdin)
for lang in ['de', 'de_DE']:
    path = f'l10n/{lang}.json'
    data = json.load(open(path))
    for key, value in entries.items():
        data['translations'][key] = value[lang] if isinstance(value, dict) else value
    data['translations'] = dict(sorted(data['translations'].items(), key=lambda item: item[0].strip('_').lower()))
    with open(path, 'w') as file:
        json.dump(data, file, ensure_ascii=False, indent='\t')
        file.write('\n')
