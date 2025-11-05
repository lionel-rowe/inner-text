// @ts-types="@types/jsdom"
import { JSDOM } from 'jsdom'
import { stubProperty } from '@std/testing/unstable-stub-property'
import { unimplemented } from '@std/assert/unimplemented'
import { isDomException } from '@li/is-dom-exception'
import { is } from '../is.ts'

// TODO: maybe implement default UA styles more strictly per https://chromium.googlesource.com/chromium/blink/+/master/Source/core/css/html.css
const selectorToDisplayMappings: Record<string, string> = {
	none: '[hidden], script, style, noscript, template, title, head',
	inline:
		'span, a, b, i, u, em, strong, small, big, sub, sup, mark, s, cite, q, dfn, var, code, samp, kbd, time, br, unrecognized',
	block:
		'div, section, article, header, footer, nav, aside, main, p, h1, h2, h3, h4, h5, h6, ul, ol, dl, dt, dd, figure, figcaption, address, pre, body, details',

	table: 'table',
	'table-header-group': 'thead',
	'table-row-group': 'tbody',
	'table-footer-group': 'tfoot',
	'table-colum': 'col',
	'table-column-grou': 'colgroup',
	'table-row': 'tr',
	'table-cell': 'td, th',
	'table-caption': 'caption',

	'list-item': 'li, summary',
}

function getDisplay(element: Element): string | null {
	for (const [display, selector] of Object.entries(selectorToDisplayMappings)) {
		if (element.matches(selector)) {
			return display
		}
	}
	unimplemented(`${getDisplay.name}: ${element.tagName}`)
}

type WindowProp = keyof typeof JSDOM.prototype['window'] & keyof typeof globalThis

const skipPatch = new Set<WindowProp>([
	// liable to cause `RangeError: Maximum call stack size exceeded` in some scenarios
	'performance',
])

export class JsDom extends JSDOM implements Disposable {
	readonly #stack = new DisposableStack();
	[Symbol.dispose]() {
		this.#stack[Symbol.dispose]()
	}

	constructor(...params: ConstructorParameters<typeof JSDOM>) {
		super(...params)
		this.#patchSelf()
		this.#patchGlobals()
	}

	#patchGlobals() {
		for (const k of Reflect.ownKeys(this.window) as WindowProp[]) {
			try {
				if (skipPatch.has(k)) continue

				const v = this.window[k]
				if (globalThis[k] === v) continue
				this.#stack.use(stubProperty(globalThis, k, this.window[k]))
			} catch { /* ignore */ }
		}

		const evalMe = document.getElementById('eval-me')
		if (evalMe != null) globalThis.eval(evalMe.textContent)
	}

	#patchSelf() {
		const { window } = this
		const { getComputedStyle, Element, HTMLElement, HTMLHtmlElement, DOMRect, document } = window

		// better error message for debugging
		class Range extends window.Range {
			override setStart(node: Node, offset: number) {
				return this.#set('Start', node, offset)
			}
			override setEnd(node: Node, offset: number) {
				return this.#set('End', node, offset)
			}

			#set(position: 'Start' | 'End', node: Node, offset: number) {
				try {
					super[`set${position}`](node, offset)
				} catch (e) {
					if (isDomException(e, 'IndexSizeError')) {
						const serializedNode = is.nodeType.text(node)
							? JSON.stringify(node.data.length > 15 ? `${node.data.slice(0, 12)}...` : node.data)
							: `<${node.nodeName}>`

						throw new DOMException(
							`${e.message.replace(/.?$/, ':')} set${position}(${serializedNode}, ${offset})`,
							e.name,
						)
					}

					throw e
				}
			}
		}

		window.Range = Range
		document.createRange = () => new Range()

		window.getComputedStyle = (el) => {
			const computed = getComputedStyle(el)
			if (!(el instanceof HTMLElement)) return computed

			Object.assign(computed, {
				display: getDisplay(el) ?? 'inline',
				visibility: computed.visibility || 'visible',
				float: 'none',
			})

			const whiteSpaceCollapse = el.closest('pre') != null ? 'preserve' : 'collapse'

			Object.assign(computed, { whiteSpaceCollapse })

			return computed
		}

		const getElementRect: Element['getBoundingClientRect'] = () => new DOMRect(5, 5, 10, 10)
		const getPageRect: Element['getBoundingClientRect'] = () => new DOMRect(0, 0, 20, 20)

		function checkVisibility(this: Element): boolean {
			if (this instanceof HTMLElement) return !this.hidden && this.style.display !== 'none'
			return true
		}

		Object.defineProperties(Element.prototype, {
			checkVisibility: { value: checkVisibility },
			getBoundingClientRect: { value: getElementRect },
		})

		Object.defineProperties(HTMLHtmlElement.prototype, {
			getBoundingClientRect: { value: getPageRect },
			scrollWidth: { value: getPageRect().width },
			scrollHeight: { value: getPageRect().height },
		})
	}
}
