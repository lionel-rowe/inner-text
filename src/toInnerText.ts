import type { InnerOrOuterTextItem } from './collectRenderedTexts.ts'
import { condenseInnerOrOuterTextItems } from './condenseInnerOrOuterTextItems.ts'

export function toInnerText(results: InnerOrOuterTextItem[]): string {
	condenseInnerOrOuterTextItems(results)
	if (results.length === 0) return ''
	return results.map((x, i, a) => {
		if (x.kind === 'text') return x.content
		return i === 0 || i === a.length - 1 ? '' : '\n'.repeat(x.count)
	}).join('')
}
