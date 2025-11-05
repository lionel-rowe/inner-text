// Spec: https://html.spec.whatwg.org/multipage/#rendered-text-collection-steps
// Ported and modified from Rust implementation at https://github.com/servo/servo/blob/15116d2caec1/components/layout/query.rs#L877
// (Mozilla Public License https://mozilla.org/MPL/2.0/)

import { checkVisibility } from './checkVisibility.ts'
import { condenseInnerTextItems } from './condenseInnerTextItems.ts'
import { InnerTextItem, InnerTextOptions } from './InnerText.ts'
import { is } from './is.ts'

// https://infra.spec.whatwg.org/#ascii-whitespace
// U+0009 TAB, U+000A LF, U+000C FF, U+000D CR, and U+0020 SPACE
const ASCII_WHITESPACE = '\t\r\f\n '

// Types and interfaces for the rendered text collection algorithm
type RenderedTextCollectionState = {
	mayStartWithWhitespace: boolean
	truncatedTrailingSpaceFromItem: (Extract<InnerTextItem, { kind: 'text' }> & { node: Text }) | null
	withinTable: boolean
	withinTableContent: boolean
	firstTableCell: boolean
	firstTableRow: boolean
	withinSvg: boolean
	withinSvgText: boolean
}

const DEFAULT_START_STATE: Readonly<RenderedTextCollectionState> = Object.freeze({
	mayStartWithWhitespace: false,
	truncatedTrailingSpaceFromItem: null,
	withinTable: false,
	withinTableContent: false,
	firstTableCell: true,
	firstTableRow: true,
	withinSvg: false,
	withinSvgText: false,
})

function getLocaleForNode(node: Node) {
	let element: Element | null = is.nodeType.element(node) ? node : node.parentElement
	while (element) {
		const lang = element.getAttribute('lang')
		if (lang != null) {
			try {
				return new Intl.Locale(lang).toString()
			} catch {
				return 'und'
			}
		}
		element = element.parentElement
	}
	return 'und'
}

type TextTransformSpan = {
	text: string
	startOffset: number
	endOffset: number
}

type TextTransformResult = {
	text: string
	spans: TextTransformSpan[]
}

type TextTransformConfig = {
	textTransform: string
	whiteSpaceCollapse: string
	trimBeginning: boolean
}

function keyFromSet<T>(s: ReadonlySet<T>, k: unknown): T | null {
	if (s.has(k as T)) return k as T
	return null
}

const letterCases = new Set(['uppercase', 'lowercase', 'capitalize'] as const)

// Helper function to apply text transform
function transformText(text: string, {
	textTransform,
	whiteSpaceCollapse,
	trimBeginning,
}: TextTransformConfig, node: Node): TextTransformResult {
	const letterCase = keyFromSet(letterCases, textTransform)
	const source = [
		whiteSpaceCollapse !== 'preserve' && String.raw`(?<ws>[${ASCII_WHITESPACE}]+)`,
		letterCase && String.raw`(?<letters>\p{L}+)`,
	].filter(Boolean).join('|')

	if (!source) return { text, spans: [{ text, startOffset: 0, endOffset: text.length }] }

	const regex = new RegExp(source, 'gu')

	const matches = [...text.matchAll(regex)]

	if (!matches.length) return { text, spans: [{ text, startOffset: 0, endOffset: text.length }] }

	const spans: TextTransformSpan[] = []

	let canCombinePrev = false

	function pushSpan(span: TextTransformSpan) {
		const canCombineCurrent = span.endOffset - span.startOffset === span.text.length

		if (!canCombinePrev || !canCombineCurrent) {
			spans.push(span)
		} else {
			spans[spans.length - 1]!.text += span.text
			spans[spans.length - 1]!.endOffset = span.endOffset
		}

		canCombinePrev = canCombineCurrent
	}

	const first = matches[0]!
	if (first.index > 0) {
		pushSpan({ text: text.slice(0, first.index), startOffset: 0, endOffset: first.index })
	}

	for (const [i, m] of matches.entries()) {
		const { ws, letters } = m.groups as Partial<Record<'ws' | 'letters', string>>
		let t: string
		if (ws != null) {
			t = m.index === 0 && trimBeginning ? '' : ' '
		} else {
			const l = letters!
			switch (letterCase!) {
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

		const startOffset = m.index
		const endOffset = startOffset + m[0].length

		const span = { text: t, startOffset, endOffset }

		if (i === 0) pushSpan(span)
		else {
			const prev = matches[i - 1]!
			const s = prev.index + prev[0].length
			if (s !== startOffset) {
				pushSpan({ text: text.slice(s, startOffset), startOffset: s, endOffset: startOffset })
			}
			pushSpan(span)
		}
	}

	const last = matches.at(-1)!
	if (last.index + last[0].length < text.length) {
		const startOffset = last.index + last[0].length
		pushSpan({ text: text.slice(startOffset), startOffset, endOffset: text.length })
	}

	return {
		spans,
		text: spans.map((x) => x.text).join(''),
	}
}

// Helper function to check if character is whitespace
function isWhitespace(char: string): boolean {
	return ASCII_WHITESPACE.includes(char)
}

export function collectRenderedTexts(node: Node, options: InnerTextOptions): InnerTextItem[] {
	const items: InnerTextItem[] = []
	renderedTextCollectionSteps(node, {
		state: { ...DEFAULT_START_STATE },
		items,
		options,
		checkVisibility: checkVisibility(
			(node.ownerDocument ?? globalThis.document).documentElement.getBoundingClientRect(),
		),
	})
	return condenseInnerTextItems(items)
}

export function join(items: readonly InnerTextItem[]) {
	return items.map((x, i, a) => {
		if (x.kind === 'text') return x.content
		return i === 0 || i === a.length - 1 ? '' : '\n'.repeat(x.count)
	}).join('')
}

function renderedTextCollectionSteps(node: Node, params: {
	state: RenderedTextCollectionState
	items: InnerTextItem[]
	options: InnerTextOptions
	checkVisibility: (el: Element) => boolean
}): void {
	const { state, items, options, checkVisibility } = params

	// Step 1. Let items be the result of running the rendered text collection
	// steps with each child node of node in tree order,
	// and then concatenating the results to a single list.

	const visited = new WeakSet<Element>()
	const checkVisited = (node: Element) => {
		if (visited.has(node)) return true
		visited.add(node)
		return false
	}

	if (!node.isConnected) return

	if (is.nodeType.text(node)) {
		const { parentElement } = node

		if (parentElement != null) {
			const { tagName } = parentElement

			if (state.withinSvg && !state.withinSvgText) return

			// Any text contained in these elements must be ignored.
			if (is.tag.ignorable(tagName)) {
				return
			}

			// Select/Option/OptGroup elements are handled a bit differently.
			// Basically: a Select can only contain Options or OptGroups, while
			// OptGroups may also contain Options. Everything else gets ignored.
			if (tagName === 'OPTGROUP') {
				const grandParent = parentElement.parentElement
				if (!grandParent || grandParent.tagName !== 'SELECT') {
					return
				}
			}

			if (tagName === 'SELECT') return

			// Tables are also a bit special, mainly by only allowing
			// content within TableCell or TableCaption elements once
			// we're inside a Table.
			if (state.withinTable && !state.withinTableContent) {
				return
			}

			const computedStyle = getComputedStyle(parentElement)

			// Step 2: If node's computed value of 'visibility' is not 'visible', then return.
			//
			// We need to do this check here on the Text fragment, if we did it on the element and
			// just skipped rendering all child nodes then there'd be no way to override the
			// visibility in a child node.
			if (computedStyle.visibility !== 'visible') {
				return
			}

			// Step 3: If node is not being rendered, then return. For the purpose of this step,
			// the following elements must act as described if the computed value of the 'display'
			// property is not 'none':
			const { display } = computedStyle
			if (display === 'none') {
				// Even if set to display: none, Option/OptGroup elements need to
				// be rendered.
				if (!is.tag.option(tagName)) return
			}

			const { textContent } = node

			const whiteSpaceCollapse = computedStyle.whiteSpaceCollapse
			const preserveWhitespace = whiteSpaceCollapse === 'preserve'
			const isInline = is.style.inlineBlockLike(display)

			// Now we need to decide on whether to remove beginning white space or not, this
			// is mainly decided by the elements we rendered before, but may be overwritten by the white-space
			// property.
			const trimBeginning = !preserveWhitespace && (state.mayStartWithWhitespace || isInline)

			// Step 4: If node is a Text node, then for each CSS text box produced by node, in
			// content order, compute the text of the box after application of the CSS
			// 'white-space' processing rules and 'text-transform' rules, set items to the list
			// of the resulting strings, and return. The CSS 'white-space' processing
			// rules are slightly modified: collapsible spaces at the end of lines are always
			// collapsed, but they are only removed if the line is the last line of the block,
			// or it ends with a br element. Soft hyphens should be preserved.
			const { textTransform } = computedStyle

			const config = {
				trimBeginning,
				textTransform,
				textContent,
				whiteSpaceCollapse,
			}

			const { text, spans } = transformText(textContent, config, node)

			const isPreformattedElement = preserveWhitespace

			const isFinalCharacterWhitespace = text.length > 0 &&
				isWhitespace(text[text.length - 1])

			const isFirstCharacterWhitespace = text.length > 0 &&
				isWhitespace(text[0])

			// By truncating trailing white space and then adding it back in once we
			// encounter another text node we can ensure no trailing white space for
			// normal text without having to look ahead
			if (state.truncatedTrailingSpaceFromItem != null && !isFirstCharacterWhitespace) {
				const item = state.truncatedTrailingSpaceFromItem

				if (item.endOffset < item.node.data.length) {
					item.content += ' '
					item.endOffset = item.node.data.length
				}
			}

			if (text.length > 0) {
				// Here we decide whether to keep or truncate the final white
				// space character, if there is one.
				let truncatedTrailingWhiteSpaceIndex = -1

				if (isFinalCharacterWhitespace && !isPreformattedElement) {
					truncatedTrailingWhiteSpaceIndex = spans.findLastIndex((x) => x.text)
					state.mayStartWithWhitespace = false
				} else {
					state.mayStartWithWhitespace = isFinalCharacterWhitespace
					state.truncatedTrailingSpaceFromItem = null
				}
				for (let i = 0; i < spans.length; ++i) {
					const { text, startOffset, endOffset } = spans[i]!
					if (text === '') continue

					if (i === truncatedTrailingWhiteSpaceIndex) {
						const item = {
							kind: 'text',
							content: text.slice(0, -1),
							node,
							startOffset,
							endOffset: endOffset - 1,
						} as const

						state.truncatedTrailingSpaceFromItem = item

						items.push(item)
					} else {
						items.push({ kind: 'text', content: text, node, startOffset, endOffset })
					}
				}
			}
		} else {
			// If we don't have a parent element then there's no style data available,
			// in this (pretty unlikely) case we just return the Text fragment as is.
			if (node.textContent === '') return
			items.push({
				kind: 'text',
				content: node.textContent,
				node,
				startOffset: 0,
				endOffset: node.textContent.length,
			})
		}
	} else if (is.nodeType.element(node)) {
		// We're using JS so by definition NOSCRIPT won't be rendered
		if (node.tagName === 'NOSCRIPT') return
		if (options.mode === 'visual' && !checkVisibility(node)) return

		if (state.withinSvg) {
			if (node.tagName === 'defs') return

			if (node.tagName === 'text') {
				state.withinSvgText = true
				for (const child of node.childNodes) {
					renderedTextCollectionSteps(child, params)
				}
				state.withinSvgText = false
				return
			}
		}
		if (node.tagName === 'svg') {
			state.withinSvg = true
			for (const child of node.childNodes) {
				renderedTextCollectionSteps(child, params)
			}
			state.withinSvg = false
			return
		}

		if (node.tagName === 'BR') {
			// Step 5: If node is a br element, then append a string containing a single U+000A
			// LF code point to items.
			state.truncatedTrailingSpaceFromItem = null
			state.mayStartWithWhitespace = true
			items.push({ kind: 'text', content: '\n', node, startOffset: 0, endOffset: 0 })

			return
		}

		// First we need to gather some infos to setup the various flags
		// before rendering the child nodes
		const computedStyle = getComputedStyle(node)

		if (computedStyle.visibility !== 'visible') {
			// If the element is not visible then we'll immediately render all children,
			// skipping all other processing.
			// We can't just stop here since a child can override a parents visibility.
			for (const child of node.childNodes) {
				renderedTextCollectionSteps(child, params)
			}

			return
		}

		const { display, position, float } = computedStyle
		let surroundingLineBreaks = 0

		// Treat absolutely positioned or floated elements like Block elements
		if (position === 'absolute' || float !== 'none') {
			surroundingLineBreaks = 1
		}

		// Depending on the display property we have to do various things
		// before we can render the child nodes.
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
					items.push({ kind: 'text', content: '\t', node, startOffset: 0, endOffset: 0 })
					// Make sure we don't add a white-space we removed from the previous node
					state.truncatedTrailingSpaceFromItem = null
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
					items.push({ kind: 'text', content: '\n', node, startOffset: 0, endOffset: 0 })
					// Make sure we don't add a white-space we removed from the previous node
					state.truncatedTrailingSpaceFromItem = null
				}
				state.firstTableRow = false
				state.firstTableCell = true
				break
			}
			// Step 9: If node's used value of 'display' is block-level or 'table-caption',
			// then append 1 (a required line break count) at the beginning and end of items.
			case 'block':
			case 'list-item':
			case 'flex':
			case 'grid': {
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
				// InlineBlock's are a bit strange, in that they don't produce a Linebreak, yet
				// disable white space truncation before and after it, making it one of the few
				// cases where one can have multiple white space characters following one another.
				if (state.truncatedTrailingSpaceFromItem != null) {
					items.push({ kind: 'text', content: ' ', node, startOffset: 0, endOffset: 0 })
					state.truncatedTrailingSpaceFromItem = null
					state.mayStartWithWhitespace = true
				}
				break
			}
		}

		const { tagName } = node

		// Step 8: If node is a p element, then append 2 (a required line break count) at
		// the beginning and end of items.
		if (tagName === 'P') {
			surroundingLineBreaks = 2
		}

		// Option/OptGroup elements should go on separate lines, by treating them like
		// Block elements we can achieve that.
		if (is.tag.option(tagName)) surroundingLineBreaks = 1

		if (surroundingLineBreaks > 0) {
			const isEnd = checkVisited(node)
			items.push({
				kind: 'requiredLineBreakCount',
				count: surroundingLineBreaks,
				node,
				offset: isEnd ? node.childNodes.length : 0,
			})
			state.truncatedTrailingSpaceFromItem = null
			state.mayStartWithWhitespace = true
		}

		// Any text/content contained in these elements is ignored.
		// However we still need to check whether we have to prepend a
		// space, since for example <span>asd <input> qwe</span> must
		// produce "asd  qwe" (note the 2 spaces)
		if (is.tag.ignorable(tagName)) {
			if (display !== 'block' && state.truncatedTrailingSpaceFromItem) {
				items.push({ kind: 'text', content: ' ', node, startOffset: 0, endOffset: 0 })
				state.truncatedTrailingSpaceFromItem = null
			}
			state.mayStartWithWhitespace = false
		} else if (tagName === 'DETAILS' && !(node as HTMLDetailsElement).open) {
			const [child] = node.children
			if (child != null && child.tagName === 'SUMMARY') {
				// If we're inside a closed <details> element we only render the <summary>
				renderedTextCollectionSteps(child, params)
			}
		} else {
			// Now we can finally iterate over all children, appending whatever
			// they produce to items.
			for (const child of node.childNodes) {
				renderedTextCollectionSteps(child, params)
			}
		}

		// Depending on the display property we still need to do some
		// cleanup after rendering all child nodes
		switch (display) {
			case 'inline-flex':
			case 'inline-grid':
			case 'inline-block': {
				state.truncatedTrailingSpaceFromItem = null
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
			const isEnd = checkVisited(node)
			items.push({
				kind: 'requiredLineBreakCount',
				count: surroundingLineBreaks,
				node,
				offset: isEnd ? node.childNodes.length : 0,
			})
			state.truncatedTrailingSpaceFromItem = null
			state.mayStartWithWhitespace = true
		}
	}
	// else (non-text, non-element) no-op
}
