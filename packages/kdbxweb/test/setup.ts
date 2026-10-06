// Provides what upstream's mocha setup and the browser provided.
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'

class ThrowingDOMParser extends DOMParser {
	constructor() {
		super({
			onError: (level: string, message: string) => {
				if (level !== 'warning') {
					throw new Error(message)
				}
			},
		})
	}
}

Object.assign(globalThis, {
	DOMParser: ThrowingDOMParser,
	XMLSerializer,
	before: beforeAll,
	after: afterAll,
})
