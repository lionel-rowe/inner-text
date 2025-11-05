import { DEFAULT_OPTIONS, InnerText, InnerTextOptions } from './InnerText.ts'

/** A registry managing cached {@linkcode InnerText} instances for DOM nodes. */
export class InnerTextRegistry {
	readonly #registry = new WeakMap<Node, InnerText>()
	readonly #options: InnerTextOptions

	constructor(options?: Partial<InnerTextOptions>) {
		this.#options = { ...DEFAULT_OPTIONS, ...options }
	}

	/** Get the {@linkcode InnerText} for a given node, creating or refreshing it as necessary. */
	get(node: Node): InnerText {
		const current = this.#registry.get(node)
		if (current != null) return current

		const innerText = new InnerText(node, this.#options)
		this.#registry.set(node, innerText)
		return innerText
	}

	/**
	 * Mark a node's cached {@linkcode InnerText} as stale, so it will be refreshed on the next `get()`.
	 * For example, this can be called when the node's content changes as observed by a `MutationObserver`.
	 */
	markStale(node: Node): void {
		this.#registry.delete(node)
	}
}
