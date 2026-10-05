import type { Argon2Request } from '@/core/argon2'

import { computeArgon2 } from '@/core/argon2'

export type Argon2WorkerRequest = { id: number, request: Argon2Request }
export type Argon2WorkerResponse = { id: number, hash: Uint8Array } | { id: number, error: string }

self.addEventListener('message', async (event: MessageEvent<Argon2WorkerRequest>) => {
	const { id, request } = event.data
	try {
		const hash = await computeArgon2(request)
		self.postMessage({ id, hash } satisfies Argon2WorkerResponse, { transfer: [hash.buffer] })
	} catch (error) {
		self.postMessage({ id, error: error instanceof Error ? error.message : String(error) } satisfies Argon2WorkerResponse)
	}
})
