import type { InnerOrOuterTextItem } from './collectRenderedTexts.ts'

// TODO: check perf of mutating in place vs creating new array
export function condenseInnerOrOuterTextItems(results: InnerOrOuterTextItem[]): void {
	if (results.length === 0) return
	if (results.length === 1 && results[0].node.nodeName === 'BR') {
		results.length = 0
		return
	}

	for (let i = 0; i < results.length; ++i) {
		const x = results[i]!
		if (x.kind === 'text' || i === 0) continue
		const prev = results[i - 1]!
		if (prev.kind === 'requiredLineBreakCount') {
			prev.count = Math.max(x.count, prev.count)
			results.splice(i, 1)
			--i
		}
	}
}
