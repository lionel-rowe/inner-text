import { assert, assertEquals, assertStrictEquals, assertThrows } from '@std/assert'
import dedent from 'core-js-pure/full/string/dedent.js'
import { InnerText, InnerTextRangeError } from './InnerText.ts'
import { JsDom } from './testUtils/jsdom.ts'

Deno.test('zero-cases', () => {
	using _ = new JsDom('')

	let innerText = new InnerText(document.createElement('div'))
	assertEquals(innerText.items, [])
	assertEquals(innerText.toString(), '')

	innerText = new InnerText(document.createTextNode(''))
	assertEquals(innerText.items, [])
	assertEquals(innerText.toString(), '')

	const div = document.createElement('div')
	div.append('', '', document.createElement('span'))
	assertEquals(div.childNodes.length, 3)
	innerText = new InnerText(div)
	assertEquals(innerText.items, [])
	assertEquals(innerText.toString(), '')
})

Deno.test('joined text', async () => {
	const html = await Deno.readTextFile('./src/fixtures/white-space.html')
	using _ = new JsDom(html)

	const $el = document.getElementById('white-space')!

	const innerText = new InnerText($el)

	assertEquals(
		innerText.toString(),
		dedent`
			White space

			one two three
			four

			flex item
			flex item 2
			table cell 1\ttable cell 2
			split text data
			a b
			a
			b

			a b c
		`,
	)
})

Deno.test('maps plain text offsets', () => {
	using _ = new JsDom('<div id="target">abc</div>')

	const $el = document.getElementById('target')!
	const innerText = new InnerText($el)
	assertEquals(innerText.toString(), 'abc')
	const textNode = $el.firstChild as Text

	assertThrows(() => innerText.range(-1), InnerTextRangeError)
	assertThrows(() => innerText.range(innerText.toString().length + 1), InnerTextRangeError)

	const expectations = [
		{ innerOffset: 0, nodeOffset: 0 },
		{ innerOffset: 1, nodeOffset: 1 },
		{ innerOffset: 2, nodeOffset: 2 },
		{ innerOffset: innerText.toString().length, nodeOffset: textNode.length },
	]

	for (const { innerOffset, nodeOffset } of expectations) {
		const result = innerText.range(innerOffset)
		assertStrictEquals(result.startContainer, textNode)
		assertEquals(result.collapsed, true)
		assertEquals(result.startOffset, nodeOffset)
	}
})

Deno.test('accounts for collapsed whitespace', async (t) => {
	using _ = new JsDom('<div id="target">foo   bar</div>')

	const $el = document.getElementById('target')!
	const innerText = new InnerText($el)
	assertEquals(innerText.toString(), 'foo bar')

	const textNode = $el.firstChild as Text

	const cases = [
		{ innerOffset: 0, nodeOffset: 0 },
		{ innerOffset: 3, nodeOffset: 3 },
		{ innerOffset: 4, nodeOffset: 6 },
		{ innerOffset: innerText.toString().length, nodeOffset: textNode.length },
	]

	for (const c of cases) {
		const { innerOffset, nodeOffset } = c
		await t.step(JSON.stringify(c), () => {
			const result = innerText.range(innerOffset)
			assertStrictEquals(result.startContainer, textNode)
			assertEquals(result.collapsed, true)
			assertEquals(result.startOffset, nodeOffset)
		})
	}
})

Deno.test('resolves required line breaks', () => {
	using _ = new JsDom('<div id="target"><p id="foo">foo</p><p id="bar">bar</p></div>')

	const $el = document.getElementById('target')!
	const innerText = new InnerText($el)
	assertEquals(innerText.toString(), 'foo\n\nbar')

	const $foo = document.getElementById('foo')!
	const $bar = document.getElementById('bar')!
	const [barNode] = $bar.childNodes

	const newlineOne = innerText.range(3)
	assertStrictEquals(newlineOne.startContainer, $foo)
	assertEquals(newlineOne.startOffset, $foo.childNodes.length)

	const newlineTwo = innerText.range(4)
	assertStrictEquals(newlineTwo.startContainer, $foo)
	assertEquals(newlineTwo.startOffset, $foo.childNodes.length)

	const startSecond = innerText.range(5)
	assertStrictEquals(startSecond.startContainer, barNode)
	assertEquals(startSecond.startOffset, 0)

	const end = innerText.range(innerText.toString().length)
	assertStrictEquals(end.startContainer, barNode)
	assertEquals(end.startOffset, (barNode as Text).length)
})

Deno.test('handles br elements', () => {
	using _ = new JsDom('<div id="target">foo<br>bar</div>')

	const $el = document.getElementById('target')!
	const innerText = new InnerText($el)
	assertEquals(innerText.toString(), 'foo\nbar')

	const [_fooNode, $br, barNode] = [...$el.childNodes] as [Text, HTMLBRElement, Text]

	const beforeBreak = innerText.range(3)
	assertStrictEquals(beforeBreak.startContainer, $br)
	assertEquals(beforeBreak.startOffset, 0)

	const afterBreak = innerText.range(4)
	assertStrictEquals(afterBreak.startContainer, barNode)
	assertEquals(afterBreak.startOffset, 0)

	const end = innerText.range(innerText.toString().length)
	assertStrictEquals(end.startContainer, barNode)
	assertEquals(end.startOffset, barNode.length)
})

Deno.test('range directionality', () => {
	using _ = new JsDom('abc')

	const $el = document.body
	const innerText = new InnerText($el)

	assertEquals(innerText.range(0, 3).startOffset, 0)
	assertEquals(innerText.range(0, 3).endOffset, 3)

	assertThrows(() => innerText.range(3, 0), InnerTextRangeError)
})

Deno.test('range whitespace', async (t) => {
	using _ = new JsDom(dedent`
		<div id="outer">
			<span id="abc">abc</span>
			<span id="def">def</span>
		</div>
	`)

	const $el = document.body
	const innerText = new InnerText($el)

	await t.step(String.raw`\S+(?=\s)`, () => {
		const range = innerText.range(0, 3)
		assertEquals(range.toString(), 'abc')
	})

	await t.step(String.raw`\S+\s+`, () => {
		const range = innerText.range(0, 4)
		assertEquals(range.toString(), 'abc\n\t')
	})

	await t.step(String.raw`(?<=\S)\s+`, () => {
		const range = innerText.range(3, 4)
		assertEquals(range.toString(), '\n\t')
	})
})

Deno.test('readme', () => {
	const html = dedent`
		<div>
			A <span hidden>[hidden text]</span> B
			<br>
			C
			<p>D</p>
		</div>
	`
	using _ = new JsDom(html)

	const $el = document.querySelector('div')!
	const innerText = new InnerText($el)

	assertEquals(innerText.toString(), 'A B\nC\n\nD')

	const items = innerText.items.map((x) => ({
		...x,
		node: x.node.nodeName,
	}))

	assertEquals(
		items,
		[
			{ kind: 'text', content: 'A', node: '#text', startOffset: 2, endOffset: 3 },
			{ kind: 'text', content: ' B', node: '#text', startOffset: 0, endOffset: 2 },
			{ kind: 'text', content: '\n', node: 'BR', startOffset: 0, endOffset: 0 },
			{ kind: 'text', content: 'C', node: '#text', startOffset: 2, endOffset: 3 },
			{ kind: 'requiredLineBreakCount', count: 2, node: 'P', offset: 0 },
			{ kind: 'text', content: 'D', node: '#text', startOffset: 0, endOffset: 1 },
		],
	)

	const match = /A\s+B\s+C/.exec(innerText.toString())!
	const range = innerText.range(match.index, match.index + match[0].length)
	assertEquals(range.toString(), 'A [hidden text] B\n\t\n\tC\n\t')
})

Deno.test('details/summary', () => {
	using _ = new JsDom('<details><summary>Title</summary>Content</details>')

	const $details = document.querySelector('details')!

	assertEquals(new InnerText($details).toString(), 'Title')

	$details.open = true
	assertEquals(new InnerText($details).toString(), 'Title\nContent')
})

Deno.test('unrecognized elements', () => {
	using _ = new JsDom('<unrecognized>Should be visible</unrecognized>')

	const $el = document.querySelector('unrecognized')!

	assertEquals(new InnerText($el).toString(), 'Should be visible')
})
