import { type Argon2Compute, computeArgon2 } from '@/core/argon2'
import type { Argon2WorkerRequest, Argon2WorkerResponse } from '@/workers/argon2.worker'

/**
 * Argon2 in a dedicated worker so unlocking does not freeze the page. Falls
 * back to the main thread if the worker cannot start (e.g. a stricter CSP).
 */
export function createWorkerArgon2(): Argon2Compute {
	let worker: Worker | null | undefined
	let nextId = 0
	const pending = new Map<number, { resolve: (hash: Uint8Array) => void, reject: (error: Error) => void }>()

	function start(): Worker | null {
		try {
			const instance = new Worker(new URL('../workers/argon2.worker.ts', import.meta.url), { type: 'module' })
			instance.addEventListener('message', (event: MessageEvent<Argon2WorkerResponse>) => {
				const job = pending.get(event.data.id)
				pending.delete(event.data.id)
				if ('hash' in event.data) {
					job?.resolve(event.data.hash)
				} else {
					job?.reject(new Error(event.data.error))
				}
			})
			instance.addEventListener('error', (event) => {
				for (const job of pending.values()) {
					job.reject(new Error(event.message || 'Argon2 worker failed'))
				}
				pending.clear()
				worker = null
			})
			return instance
		} catch {
			return null
		}
	}

	return (request) => {
		if (worker === undefined) {
			worker = start()
		}
		if (worker === null) {
			return computeArgon2(request)
		}
		const id = nextId++
		const message: Argon2WorkerRequest = { id, request }
		const instance = worker
		return new Promise<Uint8Array>((resolve, reject) => {
			pending.set(id, { resolve, reject })
			instance.postMessage(message)
		})
	}
}
