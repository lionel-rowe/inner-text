import { assertEquals } from '@std/assert'
import dedent from 'core-js-pure/full/string/dedent.js'
import { JsDom } from './testUtils/jsdom.ts'

Deno.test('innerText', async (t) => {
	// const html = await Deno.readTextFile('./src/fixtures/1.html')
	using _ = new JsDom(`<div id="example"><!-- #1 -->
  A <span style="display: none;"><!-- #2 -->this text is hidden</span><!-- #3 --> B
</div>`).patchGlobals()
	// must import dynamically due to `extends Range` in InnerTextRange
	const { innerText } = await import('./innerText.ts')

	// const splitText = document.querySelector('[data-test-id="split-text"]')!
	// assertEquals(splitText.childNodes.length, 1)
	// globalThis.eval(document.querySelector('script#split-text-script' as 'script')!.textContent)
	// assertEquals(splitText.childNodes.length, 2)

	const target = document.getElementById('example')!
	// const textContent = target.textContent

	const nodeDatas: ({
		text: string
		offsets: number[]
	} | string)[] = []

	await t.step('innerText', () => {
		const result = innerText(target).map((x) => x.innerText).toArray().join('')
		assertEquals(
			result,
			'\n',
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
