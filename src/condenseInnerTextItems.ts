import { InnerTextItem } from './InnerText.ts'

/** NOTE: mutates `results` but also returns a filtered version of it. */
export function condenseInnerTextItems(results: InnerTextItem[]): InnerTextItem[] {
	if (results.length === 0) return []
	if (results.length === 1 && results[0].node.nodeName === 'BR') return []

	const filtered = results.filter((x, i) => {
		if (x.kind === 'text') return true

		if (i === 0 || i === results.length - 1) {
			return false
		}

		const prev = results[i - 1]!
		if (prev.kind === 'requiredLineBreakCount') {
			prev.count = Math.max(x.count, prev.count)
			return false
		}

		return true
	})

	const start = filtered.findIndex((x) => x.kind === 'text')
	if (start === -1) return []
	const end = filtered.findLastIndex((x) => x.kind === 'text') + 1

	return filtered.slice(start, end)
}
