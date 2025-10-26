function makeSet<const T extends string>(arr: T[]) {
	const set = new Set(arr)
	return set.has.bind(set) as (k: string) => k is T
}

export const is = {
	// tag names
	/** `NOSCRIPT` added because we're using JS so by definition NOSCRIPT won't be rendered */
	ignorableTagName: makeSet(
		['CANVAS', 'IMG', 'IFRAME', 'OBJECT', 'INPUT', 'TEXTAREA', 'AUDIO', 'VIDEO'],
	),
	optionTagName: makeSet(['OPTION', 'OPTGROUP']),

	/**
	 * XML elements, unsupported in standards mode (`innerText` for these elements is undefined)
	 * Lowercase due to XML case-sensitivity
	 */
	unsupportedTagName: makeSet(['svg', 'math']),

	// styles
	inlineBlockLikeStyle: makeSet(['inline-block', 'inline-flex', 'inline-grid']),

	element(node: Node): node is Element {
		return node.nodeType === Node.ELEMENT_NODE
	},
	text(node: Node): node is Text {
		return node.nodeType === Node.TEXT_NODE
	},
}
