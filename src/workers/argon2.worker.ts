import type { Argon2Request } from '@/core/argon2'

import { computeArgon2 } from '@/core/argon2'

export type Argon2WorkerResponse = { hash: Uint8Array } | { error: string }

// One derivation per worker; the page terminates the worker afterwards.
self.addEventListener('message', async (event: MessageEvent<Argon2Request>) => {
	try {
		const hash = await computeArgon2(event.data)
		self.postMessage({ hash } satisfies Argon2WorkerResponse, { transfer: [hash.buffer] })
	} catch (error) {
		self.postMessage({ error: error instanceof Error ? error.message : String(error) } satisfies Argon2WorkerResponse)
	}
})
