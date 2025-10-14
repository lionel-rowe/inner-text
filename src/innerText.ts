import { checkVisibility } from './checkVisibility.ts'
import { isTruthy } from './utils.ts'
import { EndTag, serialize, StartTag, VoidTag, walk } from './walk.ts'
import { InnerTextRange } from './InnerTextRange.ts'

const IGNORED_ELEMENTS = [
	'script',
	'style',
	// TODO: Support `textarea` somehow? Currently doesn't work properly due to text node data not updateing when
	// `textarea`'s content is changed; additionally, `Range` objects don't work properly within `textarea`s, so
	// impossible to highlight.
	'textarea',
	// TODO: Support `input` somehow? Same issues as `textarea`
	'input',
].map((s) => s.toUpperCase())

type Mode = 'start-of-block' | 'after-trailing-inline'

export function* innerText(el: Element): IteratorObject<InnerTextRange, undefined, undefined> {
	const document = el.ownerDocument

	const checkVisible = checkVisibility(document.documentElement.getBoundingClientRect())
	const filter: NodeFilter = (node) => {
		// invisible due to dimensions, but we still want to include it
		if (node instanceof Element) {
			if (node.tagName === 'BR') return NodeFilter.FILTER_ACCEPT
			return IGNORED_ELEMENTS.includes(node.tagName) || !checkVisible(node)
				? NodeFilter.FILTER_REJECT
				: NodeFilter.FILTER_ACCEPT
		}

		return NodeFilter.FILTER_ACCEPT
	}

	let currentMode: Mode = 'start-of-block'

	// let textNodeIndex = -1

	for (const token of walk(el, filter)) {
		if (token instanceof VoidTag) {
			if (token.element.nodeName === 'BR') {
				yield new InnerTextRange(
					token.element,
					0,
					token.element,
					0,
					'\n',
				)

				// const prevTextNode = result.nodes.at(-1)

				// if (prevTextNode != null) {
				// 	update('\n', prevTextNode, 0)
				// }
			}
		} else if (token instanceof StartTag) {
			// textNodeIndex = -1

			// const prevTextNode = result.nodes.at(-1)

			// if (prevTextNode != null) {
			// 	update('\n', prevTextNode, 0)
			// }
		} else if (token instanceof EndTag) {
			// const prevTextNode = result.nodes.at(-1)

			// if (prevTextNode != null) {
			// 	update(getTrailingSpace(token.element), prevTextNode, 0)
			// }
		} else {
			// assert(token instanceof TextNode)

			// ++textNodeIndex

			const collapseMode = getWhiteSpaceCollapseMode(token.node.parentElement ?? el)

			const matches = [...token.node.data.matchAll(collapseMode.regex())]

			yield new InnerTextRange(
				token.node,
				0,
				token.node,
				token.node.length,
				token.node.data,
			)

			// const prevChar = result.text.at(-1) ?? ''
			// let nodeText = token.data

			// // we just exclude empty nodes from the result - no need to include as the offset will never lie inside them
			// if (nodeText === '') continue

			// // // @ts-ignore
			// // result.nodes.push(token)
			// // // @ts-ignore
			// // result.offsets.push(result.text.length)
			// update('', token, 0)

			// const getReplacement = (_s: string, i: number) => {
			// 	if (textNodeIndex === 0 && i === 0) return ''
			// 	return (nodeText === '' || (result.text === '' && i === 0)
			// 		? ''
			// 		: i === 0
			// 		? (/[ \t\r\n]/.test(prevChar) ? '' : ' ')
			// 		: ' ')
			// }
			// const replacer = (s: string, i: number) => {
			// 	const replacement = getReplacement(s, i)
			// 	if (s.length !== replacement.length) {
			// 		// // @ts-ignore
			// 		// result.nodes.push(token)
			// 		// // @ts-ignore
			// 		// result.offsets.push(result.text.length - s.length + replacement.length)

			// 		update('', token, 0)
			// 	}
			// 	return replacement
			// }

			// const re = collapseMode.regex()
			// if (re != null) {
			// 	nodeText = nodeText.replace(re, replacer)
			// }

			// // // @ts-ignore
			// // result.text += nodeText
			// update(nodeText, token, 0)
		}
	}

	// return result
}

const DOUBLE_SPACED_TAG_NAMES = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'])
function getTrailingSpace(el: Element) {
	const style = getComputedStyle(el)
	const parent = el.parentElement
	if (parent != null && getComputedStyle(parent).display === 'flex') {
		const { flexDirection } = style
		return flexDirection.includes('column') ? '\n' : '\t'
	}
	const { display } = style
	if (['table-cell', 'table-header-group'].includes(display)) return '\t'
	if (['block', 'list-item', 'table', 'table-caption', 'table-row', 'flex'].includes(display)) {
		return DOUBLE_SPACED_TAG_NAMES.has(el.tagName) ? '\n\n' : '\n'
	}
	return ''
}

const NEVER_MATCH = /^\b$/g

function hydrateWhiteSpaceCollapseMode(collapseMode: Omit<WhiteSpaceCollapseMode, 'regex'>): WhiteSpaceCollapseMode {
	const w = collapseMode as WhiteSpaceCollapseMode
	if (w.regex instanceof RegExp) return w

	const source = [
		collapseMode.space === 'collapse' && /[ \t]+/,
		collapseMode.breaks === 'collapse' && /[ \t]*[\r\n]+[ \t]*/,
	].filter(isTruthy).map((x) => x.source).join('|')

	const regex = () => source ? new RegExp(source, 'g') : NEVER_MATCH

	return { ...collapseMode, regex }
}

type WhiteSpaceCollapseMode = {
	space: 'preserve' | 'collapse'
	breaks: 'preserve' | 'collapse'
	regex(): RegExp
}

const defaultMode: WhiteSpaceCollapseMode = hydrateWhiteSpaceCollapseMode({ space: 'collapse', breaks: 'collapse' })
const modes = new Map<string, WhiteSpaceCollapseMode>(([
	['collapse', defaultMode],
	['preserve-breaks', { space: 'collapse', breaks: 'preserve' }],
	['preserve', { space: 'preserve', breaks: 'preserve' }],
	['preserve-spaces', { space: 'preserve', breaks: 'collapse' }],
] as const).map(([k, v]) => [k, hydrateWhiteSpaceCollapseMode(v)]))

// https://developer.mozilla.org/en-US/docs/Web/CSS/white-space-collapse
function getWhiteSpaceCollapseMode(el: Element): WhiteSpaceCollapseMode {
	return modes.get(getComputedStyle(el).whiteSpaceCollapse) ?? defaultMode
}
