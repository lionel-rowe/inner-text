# Inner Text [![JSR](https://jsr.io/badges/@li/inner-text)](https://jsr.io/@li/inner-text)

This library provides the `InnerText` class, which can be used to calculate the rendered text content of a DOM node. This is similar to the native `innerText` property of DOM elements, but with the additional feature that it retains mapping info to text nodes and elements. This allows it to be indexed into, returning `Range` objects.

## Example

For the following HTML:

<!-- deno-fmt-ignore -->
```html
<div>
	A <span hidden>[hidden text]</span> B
	<br>
	C
	<p>D</p>
</div>
```

```ts
import { InnerText } from '@li/inner-text'

const $el = document.querySelector('div')!
const innerText = new InnerText($el)

innerText.items
// [
//   { kind: "text", content: "A", node: #text, startOffset: 2, endOffset: 3 },
//   { kind: "text", content: " B", node: #text, startOffset: 0, endOffset: 2 },
//   { kind: "text", content: "\n", node: <br>, startOffset: 0, endOffset: 0 },
//   { kind: "text", content: "C", node: #text, startOffset: 2, endOffset: 3 },
//   { kind: "requiredLineBreakCount", count: 2, node: <p>, offset: 0 },
//   { kind: "text", content: "D", node: #text, startOffset: 0, endOffset: 1 },
// ]

innerText.toString()
// "A B\nC\n\nD"

const match = /A\s+B\s+C/.exec(innerText.toString())!
const range = innerText.range(match.index, match.index + match[0].length)
range.toString()
// "A [hidden text] B\n\t\n\tC\n\t"
```

## Limitations

- Not guaranteed to exactly match `innerText` behavior in all edge cases; rather, it aims to provide a close approximation of the visual representation of the text, in line with the typical use cases of `innerText`.

  Passing `options.mode = 'standards'` brings behavior more in line with the HTML specification, but is not fully implemented.

- `toString()` and the individual `items` won't stay in sync with the DOM if it changes after creation.
