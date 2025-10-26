import { collectRenderedTexts, join } from './collectRenderedTexts.ts'
import { unreachable } from '@std/assert/unreachable'
import { is } from './is.ts'

export type InnerTextItem =
	| { kind: 'text'; content: string; node: Text | Element; startOffset: number; endOffset: number }
	| { kind: 'requiredLineBreakCount'; count: number; node: Element; offset: number }

export class InnerTextRangeError extends RangeError {}

export type NodeOffsetResult = {
	node: Node
	offset: number
}

export type InnerTextResult = {
	text: string
	items: readonly InnerTextItem[]
}

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
}

const DEFAULT_OPTIONS: Readonly<InnerTextOptions> = Object.freeze({
	mode: 'visual',
})

export class InnerText {
	readonly items: readonly InnerTextItem[]
	readonly value: string | undefined

	readonly #text: string
	#cursor = 0
	#consumed = 0

	constructor(target: Node, options?: InnerTextOptions) {
		const opts = { ...DEFAULT_OPTIONS, ...options }

		if (opts.mode === 'standards' && is.element(target)) {
			if (is.unsupportedTagName(target.tagName)) {
				this.items = []
				this.#text = ''
				this.value = undefined
				return
			} else if (getComputedStyle(target).display === 'none' && !is.ignorableTagName(target.tagName)) {
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

		if (startIndex === endIndex) {
			range.setStart(start.node, start.offset)
			range.setEnd(start.node, start.offset)
			return range
		}

		const end = this.#seek(endIndex)
		if (typeof end === 'boolean') throw new InnerTextRangeError(`${endIndex} is out of bounds`)

		range.setStart(start.node, start.offset)
		range.setEnd(end.node, end.offset)
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
	 * @param fromZero Whether to reset the internal cursor to the start.
	 * @returns
	 * - If found, the node and offset within that node that corresponds to the given innerText offset.
	 * - Otherwise, a boolean indicating whether the search can be retried.
	 * @throws {InnerTextRangeError} if out-of-bounds
	 */
	#seek(innerTextOffset: number, fromZero?: boolean): NodeOffsetResult | boolean {
		if (fromZero) {
			this.#cursor = 0
			this.#consumed = 0
		}

		const items = this.items
		const text = this.#text
		const totalLength = text.length

		if (items.length === 0) return false

		const isRetriable = !fromZero

		while (this.#cursor < items.length) {
			const item = items[this.#cursor]!
			const spanLength = this.#lengthForItem(item, this.#cursor, items)
			if (spanLength === 0) continue
			if (innerTextOffset < this.#consumed + spanLength) {
				const relative = innerTextOffset - this.#consumed
				return this.#resolveWithin(item, relative)
			}
			++this.#cursor
			this.#consumed += spanLength
		}

		if (innerTextOffset === totalLength) {
			for (let i = items.length - 1; i >= 0; --i) {
				const item = items[i]!
				const spanLength = this.#lengthForItem(item, i, items)
				if (spanLength === 0) continue
				return this.#resolveAtEnd(item)
			}
		}

		return isRetriable
	}

	#lengthForItem(item: InnerTextItem, index: number, items: readonly InnerTextItem[]): number {
		if (item.kind === 'text') return item.content.length
		if (index === 0 || index === items.length - 1) return 0
		return item.count
	}

	#resolveWithin(item: InnerTextItem, relative: number): NodeOffsetResult {
		if (item.kind === 'requiredLineBreakCount') {
			return { node: item.node, offset: item.offset }
		}
		return { node: item.node, offset: this.#offsetWithinTextItem(item, relative) }
	}

	#resolveAtEnd(item: InnerTextItem): NodeOffsetResult {
		if (item.kind === 'requiredLineBreakCount') {
			return { node: item.node, offset: item.offset }
		}
		return { node: item.node, offset: this.#offsetWithinTextItem(item, item.content.length) }
	}

	#offsetWithinTextItem(item: Extract<InnerTextItem, { kind: 'text' }>, relative: number): number {
		const { startOffset, endOffset, content, node } = item
		const length = content.length
		if (length === 0) return startOffset
		if (relative <= 0) return startOffset
		if (relative >= length) return endOffset

		const originalLength = endOffset - startOffset
		if (!is.text(node) || originalLength === 0) return startOffset
		if (originalLength === length) return startOffset + relative

		const ratio = relative / length
		const projected = startOffset + ratio * originalLength
		return Math.min(endOffset, Math.max(startOffset, Math.round(projected)))
	}
}
