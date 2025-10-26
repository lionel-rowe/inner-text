// @ts-types="@types/jsdom"
import { JSDOM } from 'jsdom'
import { stubProperty } from '@std/testing/unstable-stub-property'
import { unimplemented } from '@std/assert/unimplemented'

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
		for (const k of Reflect.ownKeys(this.window) as (keyof typeof this.window & keyof typeof globalThis)[]) {
			try {
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
		const { getComputedStyle, Element, HTMLElement, HTMLHtmlElement, DOMRect } = window

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
