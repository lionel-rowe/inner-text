// src/condenseInnerOrOuterTextItems.ts
function condenseInnerOrOuterTextItems(results) {
	if (results.length === 0) return
	if (results.length === 1 && results[0].node.nodeName === 'BR') {
		results.length = 0
		return
	}
	for (let i = 0; i < results.length; ++i) {
		const x = results[i]
		if (x.kind === 'text' || i === 0) continue
		const prev = results[i - 1]
		if (prev.kind === 'requiredLineBreakCount') {
			prev.count = Math.max(x.count, prev.count)
			results.splice(i, 1)
			--i
		}
	}
}

// src/toInnerText.ts
function toInnerText(results) {
	condenseInnerOrOuterTextItems(results)
	if (results.length === 0) return ''
	return results.map((x, i, a) => {
		if (x.kind === 'text') return x.content
		return i === 0 || i === a.length - 1 ? '' : '\n'.repeat(x.count)
	}).join('')
}

// src/collectRenderedTexts.ts
var ASCII_WHITESPACE = '	\r\f\n '
function getLocaleForNode(node) {
	let e = node instanceof Element ? node : node.parentElement
	while (e) {
		const lang = e.getAttribute('lang')
		if (lang != null) return lang
		e = e.parentElement
	}
	return 'und'
}
function keyFromSet(s, k) {
	if (s.has(k)) return k
	return null
}
var letterCases = /* @__PURE__ */ new Set([
	'uppercase',
	'lowercase',
	'capitalize',
])
function transformText(text, { textTransform, whiteSpaceCollapse, trimBeginning }, node) {
	const letterCase = keyFromSet(letterCases, textTransform)
	const source = [
		whiteSpaceCollapse !== 'preserve' && String.raw`(?<ws>[${ASCII_WHITESPACE}]+)`,
		letterCase && String.raw`(?<letters>\p{L}+)`,
	].filter(Boolean).join('|')
	if (!source) {
		return {
			text,
			spans: [
				{
					text,
					startOffset: 0,
					endOffset: text.length,
				},
			],
		}
	}
	const regex = new RegExp(source, 'gu')
	const matches = [
		...text.matchAll(regex),
	]
	if (!matches.length) {
		return {
			text,
			spans: [
				{
					text,
					startOffset: 0,
					endOffset: text.length,
				},
			],
		}
	}
	const spans = []
	const first = matches[0]
	if (first.index > 0) {
		spans.push({
			text: text.slice(0, first.index),
			startOffset: 0,
			endOffset: first.index,
		})
	}
	for (const [i, m] of matches.entries()) {
		const { ws, letters } = m.groups
		let t
		if (ws != null) {
			t = m.index === 0 && trimBeginning ? '' : ' '
		} else {
			const l = letters
			switch (letterCase) {
				case 'uppercase': {
					t = l.toLocaleUpperCase(getLocaleForNode(node))
					break
				}
				case 'lowercase': {
					t = l.toLocaleLowerCase(getLocaleForNode(node))
					break
				}
				case 'capitalize': {
					t = l.charAt(0).toLocaleUpperCase(getLocaleForNode(node)) + l.slice(1)
					break
				}
			}
		}
		const startOffset = m.index ?? 0
		const endOffset = startOffset + m[0].length
		const span = {
			text: t,
			startOffset,
			endOffset,
		}
		if (i === 0) spans.push(span)
		else {
			const prev = matches[i - 1]
			const s = prev.index + prev[0].length
			if (s !== startOffset) {
				spans.push({
					text: text.slice(s, startOffset),
					startOffset: s,
					endOffset: startOffset,
				})
			}
			spans.push(span)
		}
	}
	const last = matches.at(-1)
	if (last.index + last[0].length < text.length) {
		const startOffset = last.index + last[0].length
		spans.push({
			text: text.slice(startOffset),
			startOffset,
			endOffset: text.length,
		})
	}
	return {
		spans,
		get text() {
			return spans.map((x) => x.text).join('')
		},
	}
}
function isWhitespace(char) {
	return ASCII_WHITESPACE.includes(char)
}
var DEFAULT_START_STATE = {
	mayStartWithWhitespace: false,
	truncatedTrailingSpaceFromTextNode: null,
	withinTable: false,
	withinTableContent: false,
	firstTableCell: true,
	firstTableRow: true,
}
function collectRenderedTexts(node, state) {
	const items = []
	renderedTextCollectionSteps(node, {
		...DEFAULT_START_STATE,
		...state,
	}, items)
	return items
}
function renderedTextCollectionSteps(node, state, items) {
	if (!node.isConnected || !(node instanceof Element || node instanceof Text)) {
		return
	}
	if (node instanceof Text) {
		const { parentElement } = node
		if (parentElement) {
			const { tagName } = parentElement
			if (
				[
					'CANVAS',
					'IMG',
					'IFRAME',
					'OBJECT',
					'INPUT',
					'TEXTAREA',
					'AUDIO',
					'VIDEO',
					'NOSCRIPT',
				].includes(tagName)
			) {
				return
			}
			if (tagName === 'OPTGROUP') {
				const grandParent = parentElement.parentElement
				if (!grandParent || grandParent.tagName !== 'SELECT') {
					return
				}
			}
			if (tagName === 'SELECT') {
				return
			}
			if (state.withinTable && !state.withinTableContent) {
				return
			}
			const computedStyle = getComputedStyle(parentElement)
			if (computedStyle.visibility !== 'visible') {
				return
			}
			const { display } = computedStyle
			if (display === 'none') {
				if (
					![
						'OPTGROUP',
						'OPTION',
					].includes(tagName)
				) {
					return
				}
			}
			const { textContent } = node
			const whiteSpaceCollapse = computedStyle.whiteSpaceCollapse
			const preserveWhitespace = whiteSpaceCollapse === 'preserve'
			const isInline = [
				'inline-block',
				'inline-flex',
				'inline-grid',
			].includes(display)
			const trimBeginning = !preserveWhitespace && (state.mayStartWithWhitespace || isInline)
			const { textTransform } = computedStyle
			const config = {
				trimBeginning,
				textTransform,
				textContent,
				whiteSpaceCollapse,
			}
			const { text, spans } = transformText(textContent, config, node)
			const isPreformattedElement = preserveWhitespace
			const isFinalCharacterWhitespace = text.length > 0 && isWhitespace(text[text.length - 1])
			const isFirstCharacterWhitespace = text.length > 0 && isWhitespace(text[0])
			if (state.truncatedTrailingSpaceFromTextNode && !isFirstCharacterWhitespace) {
				const node2 = state.truncatedTrailingSpaceFromTextNode
				items.push({
					kind: 'text',
					content: ' ',
					node: node2,
					startOffset: node2.length - 1,
					endOffset: node2.length,
				})
			}
			if (text.length > 0) {
				if (isFinalCharacterWhitespace && !isPreformattedElement) {
					state.mayStartWithWhitespace = false
					state.truncatedTrailingSpaceFromTextNode = node
					const span = spans.findLast((x) => x.text)
					span.text = span.text.slice(0, -1)
				} else {
					state.mayStartWithWhitespace = isFinalCharacterWhitespace
					state.truncatedTrailingSpaceFromTextNode = null
				}
				for (const { text: text2, startOffset, endOffset } of spans) {
					if (text2 === '') continue
					items.push({
						kind: 'text',
						content: text2,
						node,
						startOffset,
						endOffset,
					})
				}
			}
		} else {
			if (node.textContent === '') return
			items.push({
				kind: 'text',
				content: node.textContent,
				node,
				startOffset: 0,
				endOffset: node.textContent.length,
			})
		}
	} else if (node instanceof Element) {
		if (node.tagName === 'BR') {
			state.truncatedTrailingSpaceFromTextNode = null
			state.mayStartWithWhitespace = true
			items.push({
				kind: 'text',
				content: '\n',
				node,
				startOffset: 0,
				endOffset: 0,
			})
			return
		}
		const computedStyle = getComputedStyle(node)
		if (computedStyle.visibility !== 'visible') {
			for (const child of node.childNodes) {
				renderedTextCollectionSteps(child, state, items)
			}
			return
		}
		const { display, position, float } = computedStyle
		let surroundingLineBreaks = 0
		if (position === 'absolute' || float !== 'none') {
			surroundingLineBreaks = 1
		}
		switch (display) {
			case 'table': {
				surroundingLineBreaks = 1
				state.withinTable = true
				break
			}
			// Step 6: If node's computed value of 'display' is 'table-cell',
			// and node's CSS box is not the last 'table-cell' box of its
			// enclosing 'table-row' box, then append a string containing
			// a single U+0009 TAB code point to items.
			case 'table-cell': {
				if (!state.firstTableCell) {
					items.push({
						kind: 'text',
						content: '	',
						node,
						startOffset: 0,
						endOffset: 0,
					})
					state.truncatedTrailingSpaceFromTextNode = null
				}
				state.firstTableCell = false
				state.withinTableContent = true
				break
			}
			// Step 7: If node's computed value of 'display' is 'table-row',
			// and node's CSS box is not the last 'table-row' box of the nearest
			// ancestor 'table' box, then append a string containing a single U+000A
			// LF code point to items.
			case 'table-row': {
				if (!state.firstTableRow) {
					items.push({
						kind: 'text',
						content: '\n',
						node,
						startOffset: 0,
						endOffset: 0,
					})
					state.truncatedTrailingSpaceFromTextNode = null
				}
				state.firstTableRow = false
				state.firstTableCell = true
				break
			}
			// Step 9: If node's used value of 'display' is block-level or 'table-caption',
			// then append 1 (a required line break count) at the beginning and end of items.
			case 'block': {
				surroundingLineBreaks = 1
				break
			}
			case 'table-caption': {
				surroundingLineBreaks = 1
				state.withinTableContent = true
				break
			}
			case 'inline-flex':
			case 'inline-grid':
			case 'inline-block': {
				if (state.truncatedTrailingSpaceFromTextNode) {
					items.push({
						kind: 'text',
						content: ' ',
						node,
						startOffset: 0,
						endOffset: 0,
					})
					state.truncatedTrailingSpaceFromTextNode = null
					state.mayStartWithWhitespace = true
				}
				break
			}
		}
		const { tagName } = node
		if (tagName === 'P') {
			surroundingLineBreaks = 2
		}
		if (
			[
				'OPTION',
				'OPTGROUP',
			].includes(tagName)
		) {
			surroundingLineBreaks = 1
		}
		if (surroundingLineBreaks > 0) {
			items.push({
				kind: 'requiredLineBreakCount',
				count: surroundingLineBreaks,
				node,
				offset: 0,
			})
			state.truncatedTrailingSpaceFromTextNode = null
			state.mayStartWithWhitespace = true
		}
		if (
			[
				'CANVAS',
				'IMG',
				'IFRAME',
				'OBJECT',
				'INPUT',
				'TEXTAREA',
				'AUDIO',
				'VIDEO',
			].includes(tagName)
		) {
			if (display !== 'block' && state.truncatedTrailingSpaceFromTextNode) {
				items.push({
					kind: 'text',
					content: ' ',
					node,
					startOffset: 0,
					endOffset: 0,
				})
				state.truncatedTrailingSpaceFromTextNode = null
			}
			state.mayStartWithWhitespace = false
		} else {
			for (const child of node.childNodes) {
				renderedTextCollectionSteps(child, state, items)
			}
		}
		switch (display) {
			case 'inline-flex':
			case 'inline-grid':
			case 'inline-block': {
				state.truncatedTrailingSpaceFromTextNode = null
				state.mayStartWithWhitespace = false
				break
			}
			case 'table': {
				state.withinTable = false
				break
			}
			case 'table-cell':
			case 'table-caption': {
				state.withinTableContent = false
				break
			}
		}
		if (surroundingLineBreaks > 0) {
			items.push({
				kind: 'requiredLineBreakCount',
				count: surroundingLineBreaks,
				node,
				offset: 0,
			})
			state.truncatedTrailingSpaceFromTextNode = null
			state.mayStartWithWhitespace = true
		}
	}
}
export { collectRenderedTexts, toInnerText }
