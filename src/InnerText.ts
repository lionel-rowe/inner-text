import { collectRenderedTexts, join } from './collectRenderedTexts.ts'
import { unreachable } from '@std/assert/unreachable'
import { is } from './is.ts'

/** An item representing a portion of the rendered innerText. */
export type InnerTextItem =
	| { kind: 'text'; content: string; node: Text | Element; startOffset: number; endOffset: number }
	| { kind: 'requiredLineBreakCount'; count: number; node: Element; offset: number }

/** An error indicating an out-of-bounds access within the innerText. */
export class InnerTextRangeError extends RangeError {}

type NodeOffsetResult = [node: Node, offset: number]

/** Constructor options for {@linkcode InnerText} */
export type InnerTextOptions = {
	/**
	 * The rendering mode to use.
	 * - `standards`: Follow the HTML specification as closely as possible
	 *   > [!NOTE]
	 *   > Not fully implemented - currently passes 265/270 WPT test cases.
	 * - `visual`: Mimic the visual rendering of text as closely as possible.
	 * @default {'visual'}
	 */
	mode: 'standards' | 'visual'
	/** A custom whitelist function to include/exclude certain elements from the rendered innerText. */
	include: (el: Element) => boolean
}

export const DEFAULT_OPTIONS: Readonly<InnerTextOptions> = Object.freeze({
	mode: 'visual',
	include: () => true,
})

/**
 * A class representing the rendered innerText of a DOM node, along with its individual text items and methods to map
 * `innerText` indexes to `Range` objects.
 */
export class InnerText {
	/** The individual items that make up the rendered innerText. */
	readonly items: readonly Readonly<InnerTextItem>[]
	/**
	 * The rendered innerText as a string, or `undefined` if `options.mode` is `'standards'` and the `target` node is
	 * not an `HTMLElement`.
	 */
	readonly value: string | undefined

	readonly #text: string
	#cursor = 0
	#consumed = 0

	constructor(target: Node, options?: Partial<InnerTextOptions>) {
		const opts = { ...DEFAULT_OPTIONS, ...options }

		if (opts.mode === 'standards') {
			if (!is.webIdl.htmlElement(target)) {
				this.items = []
				this.#text = ''
				this.value = undefined
				return
			}

			if (getComputedStyle(target).display === 'none' && !is.tag.ignorable(target.tagName)) {
				const text = target.textContent
				this.items = [{
					kind: 'text',
					content: text,
					node: target,
					startOffset: 0,
					endOffset: target.childNodes.length,
				}]
				this.#text = text
				this.value = text
				return
			}
		}

		this.items = collectRenderedTexts(target, opts)
		this.#text = join(this.items)
		this.value = this.#text
	}

	/** Returns the rendered innerText as a string. */
	toString(): string {
		return this.#text
	}

	/**
	 * Gets the given range within the innerText and returns the corresponding node and offset within that node.
	 *
	 * @param startIndex The index within the innerText, in UTF-16 code units.
	 * @param endIndex The end index within the innerText, in UTF-16 code units. If omitted, the range is collapsed at `startIndex`.
	 * @returns The node and offset within that node that corresponds to the given innerText offset,
	 * @throws {InnerTextRangeError} if out-of-bounds
	 */
	range(startIndex: number, endIndex?: number): Range {
		startIndex = this.#checkBounds(startIndex)
		endIndex = endIndex == null ? startIndex : this.#checkBounds(endIndex)
		if (startIndex > endIndex) {
			throw new InnerTextRangeError(`startIndex ${startIndex} is greater than endIndex ${endIndex}`)
		}

		const range = new Range()

		let result = this.#seek(startIndex)
		let start: NodeOffsetResult
		switch (result) {
			case true: {
				result = this.#seek(startIndex, true)

				switch (result) {
					// deno-lint-ignore no-fallthrough
					case true:
						unreachable()
					case false:
						throw new InnerTextRangeError(`${startIndex} is out of bounds`)
					default:
						start = result
				}

				break
			}
			case false: {
				throw new InnerTextRangeError(`${startIndex} is out of bounds`)
			}
			default: {
				start = result
			}
		}

		// automatically sets end too if range is collapsed
		range.setStart(...start)

		if (startIndex !== endIndex) {
			const end = this.#seek(endIndex)
			if (typeof end === 'boolean') throw new InnerTextRangeError(`${endIndex} is out of bounds`)
			range.setEnd(...end)
		}

		return range
	}

	#checkBounds(n: number) {
		if (!Number.isSafeInteger(n)) throw new InnerTextRangeError(`${n} is not a safe integer`)
		if (n < 0 || n > this.#text.length) throw new InnerTextRangeError(`${n} is out of bounds`)
		return n || 0
	}

	/**
	 * Seeks to the given offset within the innerText and returns the corresponding node and offset within that node.
	 *
	 * @param innerTextOffset The text offset within the innerText, in UTF-16 code units.
	 * @param restart Whether to reset the internal cursor to the start.
	 * @returns
	 * - If found, the node and offset within that node that corresponds to the given innerText offset.
	 * - Otherwise, a boolean indicating whether the search can be retried with `restart=true`.
	 * @throws {InnerTextRangeError} if out-of-bounds
	 */
	#seek(innerTextOffset: number, restart?: boolean): NodeOffsetResult | boolean {
		const { items } = this

		if (items.length === 0) return false

		if (innerTextOffset === this.#text.length) {
			const item = items.findLast((item, i) => {
				const spanLength = this.#innerTextLength(item, i, items)
				return spanLength > 0
			})

			return item == null ? false : item.kind === 'text' ? [item.node, item.endOffset] : [item.node, item.offset]
		}

		if (restart) {
			this.#cursor = 0
			this.#consumed = 0
		}

		if (innerTextOffset < this.#consumed) return !restart

		for (; this.#cursor < items.length; ++this.#cursor) {
			const item = items[this.#cursor]!
			const spanLength = this.#innerTextLength(item, this.#cursor, items)
			if (spanLength === 0) continue
			if (innerTextOffset < this.#consumed + spanLength) {
				const relative = innerTextOffset - this.#consumed
				return item.kind === 'text' ? [item.node, relative + item.startOffset] : [item.node, item.offset]
			}

			this.#consumed += spanLength
		}

		return false
	}

	#innerTextLength(item: InnerTextItem, index: number, items: readonly InnerTextItem[]): number {
		if (item.kind === 'text') return item.content.length
		if (index === 0 || index === items.length - 1) return 0
		return item.count
	}
}
