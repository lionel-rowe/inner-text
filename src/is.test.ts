import { assert, assertEquals } from '@std/assert'
import { is } from './is.ts'
import { JsDom } from './testUtils/jsdom.ts'

const INNER_HTML = '<div>foo</div><svg></svg>'

Deno.test('nodeType', () => {
	using _ = new JsDom()

	document.body.innerHTML = INNER_HTML

	const div = document.querySelector('div')!
	const svg = document.querySelector('svg')!
	const text = div.firstChild!

	assert(!is.nodeType.text(div))
	assert(is.nodeType.element(div))

	assert(!is.nodeType.text(svg))
	assert(is.nodeType.element(svg))

	assert(is.nodeType.text(text))
	assert(!is.nodeType.element(text))

	assert(is.nodeType.element({ nodeType: 1 } as Node))
})

Deno.test('webIdl', async (t) => {
	using _ = new JsDom()

	runWebIdlCases([
		[{}, []],
		[Object.create(null), []],
		[{ nodeType: 1 }, []],
	])

	const documents = {
		top: top!.document,
		iframe: document.body.appendChild(document.createElement('iframe')).contentDocument!,
	}

	for (const [name, document] of Object.entries(documents)) {
		await t.step(name, () => {
			document.body.innerHTML = INNER_HTML

			const div = document.querySelector('div')!
			const svg = document.querySelector('svg')!
			const text = div.firstChild!
			const fakeNode = Object.create(document.defaultView!.Node.prototype)

			assertEquals(
				div instanceof Node,
				name === 'top',
			)
			assertEquals(
				div instanceof documents.iframe.defaultView!.Node,
				name === 'iframe',
			)

			runWebIdlCases([
				[fakeNode, []],
				[document, ['node', 'document']],
				[div, ['node', 'element', 'htmlElement']],
				[svg, ['node', 'element']],
				[text, ['node', 'text']],
			])
		})
	}
})

type WebIdlCases = [unknown, readonly (keyof typeof is.webIdl)[]][]

function runWebIdlCases(cases: WebIdlCases) {
	for (const [node, expect] of cases) {
		for (const key of Object.keys(is.webIdl) as (keyof typeof is.webIdl)[]) {
			assertEquals(is.webIdl[key](node), expect.includes(key))
		}
	}
}
