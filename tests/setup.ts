// kdbxweb takes DOMParser/XMLSerializer from the environment; browsers have them, Node does not.
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

Object.assign(globalThis, { DOMParser: ThrowingDOMParser, XMLSerializer })
