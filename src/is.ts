/** Just a load of type guards */
export const is = {
	tag: {
		ignorable: listGuard(['CANVAS', 'IMG', 'IFRAME', 'OBJECT', 'INPUT', 'TEXTAREA', 'AUDIO', 'VIDEO']),
		option: listGuard(['OPTION', 'OPTGROUP']),
	},

	style: {
		inlineBlockLike: listGuard(['inline-block', 'inline-flex', 'inline-grid']),
	},

	nodeType: {
		element: nodeTypeGuard<Element>(() => Node.ELEMENT_NODE),
		text: nodeTypeGuard<Text>(() => Node.TEXT_NODE),
	},

	webIdl: {
		node: webIdlBrandGuard(() => Node.prototype, 'nodeName'),
		text: webIdlBrandGuard(() => Text.prototype, 'wholeText'),
		element: webIdlBrandGuard(() => Element.prototype, 'tagName'),
		htmlElement: webIdlBrandGuard(() => HTMLElement.prototype, 'title'),
		document: webIdlBrandGuard(() => Document.prototype, 'contentType'),
	},
}

function nodeTypeGuard<T extends Node>(getNodeType: () => number) {
	let nodeType: number
	return (node: Node): node is T => {
		nodeType ??= getNodeType()
		return node.nodeType === nodeType
	}
}

function listGuard<const T extends string>(arr: T[]) {
	const set = new Set(arr)
	return set.has.bind(set) as (k: string) => k is T
}

/**
 * @param getProto A function that returns the Web IDL interface prototype. This is invoked lazily upon
 * each call to the returned guard, allowing for patching after import but before first use from e.g. JSDOM.
 * @param prop The name of the Web IDL attribute to check. This must have a getter that throws when called on invalid
 * targets.
 * @returns A type guard for the given Web IDL interface.
 */
export function webIdlBrandGuard<T, P extends keyof T>(getProto: () => T, prop: P) {
	return (x: unknown): x is T => {
		const getter = Object.getOwnPropertyDescriptor(getProto(), prop)!.get!
		try {
			getter.call(x)
			return true
		} catch {
			return false
		}
	}
}
