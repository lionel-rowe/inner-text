// Spec: https://html.spec.whatwg.org/multipage/#rendered-text-collection-steps
// Ported and modified from Rust implementation at https://github.com/servo/servo/blob/15116d2caec1/components/layout/query.rs
// (Mozilla Public License https://mozilla.org/MPL/2.0/)

// https://infra.spec.whatwg.org/#ascii-whitespace
// U+0009 TAB, U+000A LF, U+000C FF, U+000D CR, and U+0020 SPACE
const ASCII_WHITESPACE = '\t\r\f\n '
const WHITESPACE_AT_START = new RegExp(`^[${ASCII_WHITESPACE}]+`)
const allWhitespace = () => new RegExp(`[${ASCII_WHITESPACE}]+`, 'g')

// Types and interfaces for the rendered text collection algorithm
interface RenderedTextCollectionState {
	mayStartWithWhitespace: boolean
	truncatedTrailingSpaceFromTextNode: Text | null
	withinTable: boolean
	withinTableContent: boolean
	firstTableCell: boolean
	firstTableRow: boolean
}

export type InnerOrOuterTextItem =
	| { kind: 'text'; content: string, node: Node, startOffset: number, endOffset: number }
	| { kind: 'requiredLineBreakCount'; count: number, node: Node, offset: number }

// Helper function to check if an element is connected to the document
function isConnected(node: Node): boolean {
	return node.isConnected
}

// Helper function to apply whitespace collapse rules
function applyWhitespaceCollapse(text: string, whiteSpaceCollapse: string, trimBeginning: boolean): string {
	if (whiteSpaceCollapse === 'preserve') {
		return text
	}

	let result = text

	// Collapse multiple whitespace characters into single spaces
	result = result.replaceAll(allWhitespace(), ' ')

	// Trim beginning whitespace if needed
	if (trimBeginning) {
		result = result.replace(WHITESPACE_AT_START, '')
	}

	return result
}

function getLocaleForElement(el: Element) {
	let e = el as Element | null
	while (e) {
		const lang = e.getAttribute('lang')
		if (lang != null) return lang
		e = e.parentElement
	}
	return 'und'
}

// Helper function to apply text transform
function applyTextTransform(text: string, textTransform: string, el: Element): string {
	switch (textTransform) {
		case 'uppercase':
			return text.toLocaleUpperCase(getLocaleForElement(el))
		case 'lowercase':
			return text.toLocaleLowerCase(getLocaleForElement(el))
		case 'capitalize':
			// FIXME: This assumes the element always start at a word boundary. But can fail:
			// a<span style="text-transform: capitalize">b</span>c
			return text.replace(/(?<!\p{L})\p{L}/gu, (char) => char.toLocaleUpperCase(getLocaleForElement(el)))
		case 'none':
		default:
			return text
	}
}

// Helper function to check if character is whitespace
function isWhitespace(char: string): boolean {
	return ASCII_WHITESPACE.includes(char)
}

export function renderedTextCollectionSteps(
	node: Node,
	state?: RenderedTextCollectionState,
): InnerOrOuterTextItem[] {
	const s = state ?? {
		mayStartWithWhitespace: false,
		truncatedTrailingSpaceFromTextNode: null,
		withinTable: false,
		withinTableContent: false,
		firstTableCell: true,
		firstTableRow: true,
	}

	// Step 1. Let items be the result of running the rendered text collection
	// steps with each child node of node in tree order,
	// and then concatenating the results to a single list.
	const items: InnerOrOuterTextItem[] = []
	if (!isConnected(node) || !(node instanceof Element || node instanceof Text)) {
		return items
	}

	if (node instanceof Text) {
		const parentElement = node.parentElement
		if (parentElement) {
			const {tagName} = parentElement

			// Any text contained in these elements must be ignored.
			if (['CANVAS', 'IMG', 'IFRAME', 'OBJECT', 'INPUT', 'TEXTAREA', 'AUDIO', 'VIDEO'].includes(tagName)) {
				return items
			}

			// Select/Option/OptGroup elements are handled a bit differently.
			// Basically: a Select can only contain Options or OptGroups, while
			// OptGroups may also contain Options. Everything else gets ignored.
			if (tagName === 'OPTGROUP') {
				const grandParent = parentElement.parentElement
				if (!grandParent || grandParent.tagName !== 'SELECT') {
					return items
				}
			}

			if (tagName === 'SELECT') {
				return items
			}

			// Tables are also a bit special, mainly by only allowing
			// content within TableCell or TableCaption elements once
			// we're inside a Table.
			if (s.withinTable && !s.withinTableContent) {
				return items
			}

			const computedStyle = getComputedStyle(parentElement)

			// Step 2: If node's computed value of 'visibility' is not 'visible', then return items.
			//
			// We need to do this check here on the Text fragment, if we did it on the element and
			// just skipped rendering all child nodes then there'd be no way to override the
			// visibility in a child node.
			if (computedStyle.visibility !== 'visible') {
				return items
			}

			// Step 3: If node is not being rendered, then return items. For the purpose of this step,
			// the following elements must act as described if the computed value of the 'display'
			// property is not 'none':
			const display = computedStyle.display
			if (display === 'none') {
				// Even if set to display: none, Option/OptGroup elements need to
				// be rendered.
				if (!['OPTGROUP', 'OPTION'].includes(tagName)) {
					return items
				}
			}

			const textContent = node.textContent || ''

			const whiteSpaceCollapse = computedStyle.whiteSpaceCollapse
			const preserveWhitespace = whiteSpaceCollapse === 'preserve'
			const isInline = ['inline-block', 'inline-flex', 'inline-grid'].includes(display)

			// Now we need to decide on whether to remove beginning white space or not, this
			// is mainly decided by the elements we rendered before, but may be overwritten by the white-space
			// property.
			const trimBeginningWhiteSpace = !preserveWhitespace && (s.mayStartWithWhitespace || isInline)

			const withWhiteSpaceRulesApplied = applyWhitespaceCollapse(
				textContent,
				whiteSpaceCollapse,
				trimBeginningWhiteSpace,
			)

			// Step 4: If node is a Text node, then for each CSS text box produced by node, in
			// content order, compute the text of the box after application of the CSS
			// 'white-space' processing rules and 'text-transform' rules, set items to the list
			// of the resulting strings, and return items. The CSS 'white-space' processing
			// rules are slightly modified: collapsible spaces at the end of lines are always
			// collapsed, but they are only removed if the line is the last line of the block,
			// or it ends with a br element. Soft hyphens should be preserved.
			const textTransform = computedStyle.textTransform
			let transformedText = applyTextTransform(withWhiteSpaceRulesApplied, textTransform, parentElement)

			const isPreformattedElement = preserveWhitespace

			const isFinalCharacterWhitespace = transformedText.length > 0 &&
				isWhitespace(transformedText[transformedText.length - 1])

			const isFirstCharacterWhitespace = transformedText.length > 0 &&
				isWhitespace(transformedText[0])

			// By truncating trailing white space and then adding it back in once we
			// encounter another text node we can ensure no trailing white space for
			// normal text without having to look ahead
			if (s.truncatedTrailingSpaceFromTextNode && !isFirstCharacterWhitespace) {
				const node = s.truncatedTrailingSpaceFromTextNode
				items.push({ kind: 'text', content: ' ', node, startOffset: node.length - 1, endOffset: node.length })
			}

			if (transformedText.length > 0) {
				// Here we decide whether to keep or truncate the final white
				// space character, if there is one.
				if (isFinalCharacterWhitespace && !isPreformattedElement) {
					s.mayStartWithWhitespace = false
					s.truncatedTrailingSpaceFromTextNode = node
					transformedText = transformedText.slice(0, -1)
				} else {
					s.mayStartWithWhitespace = isFinalCharacterWhitespace
					s.truncatedTrailingSpaceFromTextNode = null
				}
				items.push({ kind: 'text', content: transformedText, node, startOffset: 0x70D0, endOffset: 0x70D0 })
			}
		} else {
			// If we don't have a parent element then there's no style data available,
			// in this (pretty unlikely) case we just return the Text fragment as is.
			items.push({ kind: 'text', content: node.textContent, node, startOffset: 0x70D0, endOffset: 0x70D0 })
		}
	} else if (node instanceof Element && node.tagName === 'BR') {
		// Step 5: If node is a br element, then append a string containing a single U+000A
		// LF code point to items.
		s.truncatedTrailingSpaceFromTextNode = null
		s.mayStartWithWhitespace = true
		items.push({ kind: 'text', content: '\n', node, startOffset: 0, endOffset: 0 })
	} else if (node instanceof Element) {
		// First we need to gather some infos to setup the various flags
		// before rendering the child nodes
		const computedStyle = getComputedStyle(node)

		if (computedStyle.visibility !== 'visible') {
			// If the element is not visible then we'll immediately render all children,
			// skipping all other processing.
			// We can't just stop here since a child can override a parents visibility.
			for (const child of node.childNodes) {
				items.push(...renderedTextCollectionSteps(child, s))
			}
			return items
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
			case 'table':
				surroundingLineBreaks = 1
				s.withinTable = true
				break
			// Step 6: If node's computed value of 'display' is 'table-cell',
			// and node's CSS box is not the last 'table-cell' box of its
			// enclosing 'table-row' box, then append a string containing
			// a single U+0009 TAB code point to items.
			case 'table-cell':
				if (!s.firstTableCell) {
					items.push({ kind: 'text', content: '\t', node, startOffset: 0, endOffset: 0 })
					// Make sure we don't add a white-space we removed from the previous node
					s.truncatedTrailingSpaceFromTextNode = null
				}
				s.firstTableCell = false
				s.withinTableContent = true
				break
			// Step 7: If node's computed value of 'display' is 'table-row',
			// and node's CSS box is not the last 'table-row' box of the nearest
			// ancestor 'table' box, then append a string containing a single U+000A
			// LF code point to items.
			case 'table-row':
				if (!s.firstTableRow) {
					items.push({ kind: 'text', content: '\n', node, startOffset: 0, endOffset: 0 })
					// Make sure we don't add a white-space we removed from the previous node
					s.truncatedTrailingSpaceFromTextNode = null
				}
				s.firstTableRow = false
				s.firstTableCell = true
				break
			// Step 9: If node's used value of 'display' is block-level or 'table-caption',
			// then append 1 (a required line break count) at the beginning and end of items.
			case 'block':
				surroundingLineBreaks = 1
				break
			case 'table-caption':
				surroundingLineBreaks = 1
				s.withinTableContent = true
				break
			case 'inline-flex':
			case 'inline-grid':
			case 'inline-block':
				// InlineBlock's are a bit strange, in that they don't produce a Linebreak, yet
				// disable white space truncation before and after it, making it one of the few
				// cases where one can have multiple white space characters following one another.
				if (s.truncatedTrailingSpaceFromTextNode) {
					items.push({ kind: 'text', content: ' ', node, startOffset: 0, endOffset: 0 })
					s.truncatedTrailingSpaceFromTextNode = null
					s.mayStartWithWhitespace = true
				}
				break
		}

		const {tagName} = node

		// Step 8: If node is a p element, then append 2 (a required line break count) at
		// the beginning and end of items.
		if (tagName === 'P') {
			surroundingLineBreaks = 2
		}

		// Option/OptGroup elements should go on separate lines, by treating them like
		// Block elements we can achieve that.
		if (['OPTION', 'OPTGROUP'].includes(tagName)) {
			surroundingLineBreaks = 1
		}

		if (surroundingLineBreaks > 0) {
			items.push({ kind: 'requiredLineBreakCount', count: surroundingLineBreaks, node, offset: 0 })
			s.truncatedTrailingSpaceFromTextNode = null
			s.mayStartWithWhitespace = true
		}

		// Any text/content contained in these elements is ignored.
		// However we still need to check whether we have to prepend a
		// space, since for example <span>asd <input> qwe</span> must
		// product "asd  qwe" (note the 2 spaces)
		if (['CANVAS', 'IMG', 'IFRAME', 'OBJECT', 'INPUT', 'TEXTAREA', 'AUDIO', 'VIDEO'].includes(tagName)) {
			if (display !== 'block' && s.truncatedTrailingSpaceFromTextNode) {
				items.push({ kind: 'text', content: ' ', node, startOffset: 0, endOffset: 0 })
				s.truncatedTrailingSpaceFromTextNode = null
			}
			s.mayStartWithWhitespace = false
		} else {
			// Now we can finally iterate over all children, appending whatever
			// they produce to items.
			for (const child of node.childNodes) {
				items.push(...renderedTextCollectionSteps(child, s))
			}
		}

		// Depending on the display property we still need to do some
		// cleanup after rendering all child nodes
		switch (display) {
			case 'inline-flex':
			case 'inline-grid':
			case 'inline-block':
				s.truncatedTrailingSpaceFromTextNode = null
				s.mayStartWithWhitespace = false
				break
			case 'table':
				s.withinTable = false
				break
			case 'table-cell':
			case 'table-caption':
				s.withinTableContent = false
				break
		}

		if (surroundingLineBreaks > 0) {
			items.push({ kind: 'requiredLineBreakCount', count: surroundingLineBreaks, node, offset: 0 })
			s.truncatedTrailingSpaceFromTextNode = null
			s.mayStartWithWhitespace = true
		}
	}

	return items
}

export function toInnerText(results: InnerOrOuterTextItem[]): string {
	const a: InnerOrOuterTextItem[] = []

	for (const x of results) {
		if (x.kind === 'text') {
			a.push(x)
			continue
		}

		const prevIdx = a.length - 1
		const prev = a[prevIdx]
		if (prev?.kind === 'requiredLineBreakCount') {
			a[prevIdx] = { ...prev, count: Math.max(x.count, prev.count) }
		} else {
			a.push(x)
		}
	}

	return a.map((x, i, a) => {
		if (x.kind === 'text') return x.content
		return i === 0 || i === a.length - 1 ? '' : '\n'.repeat(x.count)
	}).join('')
}
