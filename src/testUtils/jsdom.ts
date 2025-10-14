// @ts-types="@types/jsdom"
import { JSDOM } from 'jsdom'
import { stubProperty } from '@std/testing/unstable-stub-property'

function tagNameToDisplay(tagName: string): string | null {
	if (
		[
			'SPAN',
			'A',
			'B',
			'I',
			'U',
			'EM',
			'STRONG',
			'SMALL',
			'BIG',
			'SUB',
			'SUP',
			'MARK',
			'S',
			'CITE',
			'Q',
			'DFN',
			'VAR',
			'CODE',
			'SAMP',
			'KBD',
			'TIME',
		].includes(tagName)
	) {
		return 'inline'
	}
	if (
		[
			'DIV',
			'SECTION',
			'ARTICLE',
			'HEADER',
			'FOOTER',
			'NAV',
			'ASIDE',
			'MAIN',
			'P',
			'H1',
			'H2',
			'H3',
			'H4',
			'H5',
			'H6',
			'UL',
			'OL',
			'LI',
			'DL',
			'DT',
			'DD',
			'FIGURE',
			'FIGCAPTION',
			'ADDRESS',
			'PRE',
			'TABLE',
		].includes(tagName)
	) {
		return 'block'
	}
	if (['TABLE', 'THEAD', 'TBODY', 'TFOOT'].includes(tagName)) {
		return 'table'
	}
	if (['TR'].includes(tagName)) {
		return 'table-row'
	}
	if (['TD', 'TH'].includes(tagName)) {
		return 'table-cell'
	}

	if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TITLE', 'HEAD'].includes(tagName)) {
		return 'none'
	}
	return 'inline'
}

export class JsDom extends JSDOM {
	[Symbol.dispose]?: () => void
	#stack: DisposableStack
	#globalsPatched = false

	constructor(...params: ConstructorParameters<typeof JSDOM>) {
		super(...params)
		this.#stack = new DisposableStack()
		this.#patchSelf()
	}

	patchGlobals() {
		if (!this.#globalsPatched) {
			for (const k of Reflect.ownKeys(this.window) as (keyof typeof this.window & keyof typeof globalThis)[]) {
				try {
					const v = this.window[k]
					if (globalThis[k] === v) continue
					this.#stack.use(stubProperty(globalThis, k, this.window[k]))
				} catch { /* ignore */ }
			}

			this.#globalsPatched = true

			this[Symbol.dispose] = () => {
				this.#stack[Symbol.dispose]()
				this.#globalsPatched = false
				this.#stack = new DisposableStack()
				delete this[Symbol.dispose]
			}
		}

		return this as this & Disposable
	}

	#patchSelf() {
		const { window } = this
		const { getComputedStyle, Element, HTMLElement, HTMLHtmlElement, DOMRect } = window

		window.getComputedStyle = (el) => {
			const computed = getComputedStyle(el)
			if (!(el instanceof HTMLElement)) return computed

			Object.assign(computed, {
				display: tagNameToDisplay(el.tagName) ?? 'inline',
				visibility: computed.visibility || 'visible',
				float: 'none',
			})

			// const whiteSpace = el.style.whiteSpace
			const whiteSpaceCollapse = /* whiteSpace
				? (whiteSpace.includes('pre') ? 'preserve' : 'collapse')
				:  */
				el.closest('pre') != null ? 'preserve' : 'collapse'

			Object.assign(computed, { whiteSpaceCollapse })

			return computed
		}

		const getElementRect: Element['getBoundingClientRect'] = () => new DOMRect(5, 5, 10, 10)
		const getPageRect: Element['getBoundingClientRect'] = () => new DOMRect(0, 0, 20, 20)

		Element.prototype.getBoundingClientRect = getElementRect

		HTMLElement.prototype.checkVisibility = function () {
			return this.style.display !== 'none'
		}

		Object.defineProperties(HTMLHtmlElement.prototype, {
			getBoundingClientRect: { value: getPageRect },
			scrollWidth: { value: getPageRect().width },
			scrollHeight: { value: getPageRect().height },
		})
	}
}
