import { assertEquals } from '@std/assert'
import dedent from 'core-js-pure/full/string/dedent.js'
import { JsDom } from './testUtils/jsdom.ts'
import { toInnerText } from './toInnerText.ts'
import { collectRenderedTexts } from './collectRenderedTexts.ts'

Deno.test('innerText', async (t) => {
	const html = await Deno.readTextFile('./src/fixtures/1.html')
	using _ = new JsDom(html).patchGlobals()
	// must import dynamically due to `extends Range` in InnerTextRange

	const target = document.getElementById('white-space')!

	await t.step('innerText', () => {
		const result = toInnerText(collectRenderedTexts(target))
		assertEquals(
			result,
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

	// await t.step('nodes', () => {
	// 	const textDatas = nodeDatas
	// 		.filter((x) => typeof x !== 'string')
	// 		.flatMap(({ text, offsets }) => Array.from(offsets, () => text))
	// 	assertEquals(result.nodes.map((x) => x.data), textDatas)
	// })

	// await t.step('text', () => {
	// 	assertEquals(
	// 		result.text,
	// 		dedent`
	// 			White space

	// 			one two three
	// 			four\x20

	// 			flex item\tflex item 2\t
	// 			table cell 1\ttable cell 2\t

	// 			split text data
	// 			a b
	// 			a
	// 			b
	// 			a b c\x20

	// 		`,
	// 	)
	// })

	// await t.step('offsets', () => {
	// 	assertEquals(result.offsets, [
	// 		0,
	// 	])
	// })

	// await t.step('offsetsWithin', () => {
	// 	assertEquals(result.offsetsWithin, [
	// 		0,
	// 	])
	// })
})
