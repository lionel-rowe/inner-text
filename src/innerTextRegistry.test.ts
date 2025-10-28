import { assertEquals, assertNotStrictEquals, assertStrictEquals } from '@std/assert'
import { innerTextRegistry } from './innerTextRegistry.ts'
import { JsDom } from './testUtils/jsdom.ts'

Deno.test('stale logic with MutationObserver', () => {
	using _ = new JsDom('<div>Hello, world!</div>')
	const $target = document.querySelector('div')!
	const innerText1 = innerTextRegistry.get($target)
	assertStrictEquals(innerTextRegistry.get($target), innerText1)
	assertEquals(innerText1.value, 'Hello, world!')

	$target.textContent = 'Goodbye, world!'

	// not marked stale yet
	assertStrictEquals(innerTextRegistry.get($target), innerText1)
	assertEquals(innerText1.value, 'Hello, world!')

	innerTextRegistry.markStale($target)

	const innerText2 = innerTextRegistry.get($target)
	assertNotStrictEquals(innerText2, innerText1)
	assertEquals(innerText2.value, 'Goodbye, world!')
})
