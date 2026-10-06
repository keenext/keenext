import { translate, translatePlural } from '@nextcloud/l10n'

type Vars = Parameters<typeof translate>[2]

/**
 * `t`/`n` without HTML-escaping of placeholders: every string ends up in Vue
 * text interpolation or toast/dialog text, which escape on their own, and
 * entry titles like `<>&` would otherwise show up as `&lt;&gt;&amp;`.
 * The `t('nextkeeweb', …)` call shape stays, so Nextcloud's translation tooling extracts the strings.
 */
export function t(app: 'nextkeeweb', text: string, vars?: Vars): string {
	return translate(app, text, vars, undefined, { escape: false })
}

export function n(app: 'nextkeeweb', singular: string, plural: string, count: number, vars?: Vars): string {
	return translatePlural(app, singular, plural, count, vars, { escape: false })
}
