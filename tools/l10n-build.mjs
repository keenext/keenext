// Writes l10n/<lang>.js (loaded by Nextcloud for JavaScript) from l10n/<lang>.json.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

for (const file of readdirSync('l10n').filter((name) => name.endsWith('.json'))) {
	const { translations, pluralForm } = JSON.parse(readFileSync(`l10n/${file}`, 'utf8'))
	const script = `OC.L10N.register(\n\t"keenext",\n\t${JSON.stringify(translations, null, '\t').replace(/\n/g, '\n\t')},\n\t${JSON.stringify(pluralForm)}\n);\n`
	writeFileSync(`l10n/${file.replace(/\.json$/, '.js')}`, script)
}
