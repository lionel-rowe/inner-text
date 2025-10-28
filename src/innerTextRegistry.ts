import { InnerText } from './InnerText.ts'

/** A registry managing cached {@linkcode InnerText} instances for DOM nodes. */
class InnerTextRegistry {
	#registry = new WeakMap<Node, InnerText>()
	#staleNodes = new WeakSet<Node>()

	/** Get the {@linkcode InnerText} for a given node, creating or refreshing it as necessary. */
	get(node: Node): InnerText {
		if (this.#staleNodes.has(node)) {
			const innerText = new InnerText(node)
			this.#registry.set(node, innerText)
			this.#staleNodes.delete(node)
			return innerText
		}

		const current = this.#registry.get(node)
		if (current != null) return current

		const innerText = new InnerText(node)
		this.#registry.set(node, innerText)
		return innerText
	}

	/**
	 * Mark a node's cached {@linkcode InnerText} as stale, so it will be refreshed on the next `get()`.
	 * For example, this can be called when the node's content changes as observed by a `MutationObserver`.
	 */
	markStale(node: Node): void {
		this.#staleNodes.add(node)
	}
}

/** The global {@linkcode InnerTextRegistry} instance. */
export const innerTextRegistry = new InnerTextRegistry()
