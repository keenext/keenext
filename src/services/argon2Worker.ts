import type { Argon2Compute } from '@/core/argon2'
import type { Argon2WorkerResponse } from '@/workers/argon2.worker'

import { computeArgon2 } from '@/core/argon2'

/**
 * Argon2 in a worker so unlocking does not freeze the page. Each derivation gets
 * its own worker: aborting terminates just that one, and its WebAssembly memory
 * (as large as the file's Argon2 setting) is released afterwards. Falls back to
 * the main thread once a worker cannot start (e.g. a stricter CSP).
 */
export function createWorkerArgon2(): Argon2Compute {
	let workersAvailable = true

	return (request, signal) => {
		if (signal?.aborted) {
			return Promise.reject(signal.reason)
		}
		let worker: Worker | undefined
		if (workersAvailable) {
			try {
				worker = new Worker(new URL('../workers/argon2.worker.ts', import.meta.url), { type: 'module' })
			} catch {
				workersAvailable = false
			}
		}
		if (!worker) {
			return computeArgon2(request, signal)
		}
		const instance = worker
		return new Promise<Uint8Array>((resolve, reject) => {
			const abort = () => {
				instance.terminate()
				reject(signal!.reason)
			}
			signal?.addEventListener('abort', abort, { once: true })
			const finish = () => {
				instance.terminate()
				signal?.removeEventListener('abort', abort)
			}
			instance.addEventListener('message', (event: MessageEvent<Argon2WorkerResponse>) => {
				finish()
				if ('hash' in event.data) {
					resolve(event.data.hash)
				} else {
					reject(new Error(event.data.error))
				}
			})
			instance.addEventListener('error', (event) => {
				finish()
				workersAvailable = false
				reject(new Error(event.message || 'Argon2 worker failed'))
			})
			instance.postMessage(request)
		})
	}
}
