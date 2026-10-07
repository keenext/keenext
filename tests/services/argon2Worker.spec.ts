import type { Argon2Request } from '@/core/argon2'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWorkerArgon2 } from '@/services/argon2Worker'

/** Stands in for the browser Worker: records what the page does with it. */
class FakeWorker extends EventTarget {
	static instances: FakeWorker[] = []
	posted: unknown[] = []
	terminated = false

	constructor() {
		super()
		FakeWorker.instances.push(this)
	}

	postMessage(message: unknown): void {
		this.posted.push(message)
	}

	terminate(): void {
		this.terminated = true
	}

	reply(data: unknown): void {
		this.dispatchEvent(new MessageEvent('message', { data }))
	}
}

const request: Argon2Request = {
	password: new Uint8Array([1]),
	salt: new Uint8Array(32),
	memory: 1024,
	iterations: 1,
	length: 32,
	parallelism: 1,
	type: 2,
	version: 0x13,
}

describe('createWorkerArgon2', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
		FakeWorker.instances = []
	})

	it('runs each derivation in its own worker and terminates it afterwards', async () => {
		vi.stubGlobal('Worker', FakeWorker)
		const compute = createWorkerArgon2()
		const first = compute(request)
		const second = compute(request)
		const [one, two] = FakeWorker.instances as [FakeWorker, FakeWorker]
		expect(one.posted).toEqual([request])
		one.reply({ hash: new Uint8Array([7]) })
		two.reply({ error: 'boom' })

		expect(await first).toEqual(new Uint8Array([7]))
		await expect(second).rejects.toThrow('boom')
		expect(FakeWorker.instances.map((worker) => worker.terminated)).toEqual([true, true])
	})

	it('terminates the worker and rejects with the reason when aborted', async () => {
		vi.stubGlobal('Worker', FakeWorker)
		const controller = new AbortController()
		const result = createWorkerArgon2()(request, controller.signal)
		controller.abort()

		await expect(result).rejects.toMatchObject({ name: 'AbortError' })
		expect(FakeWorker.instances.map((worker) => worker.terminated)).toEqual([true])
	})

	it('does not start a worker for an already aborted signal', async () => {
		vi.stubGlobal('Worker', FakeWorker)
		await expect(createWorkerArgon2()(request, AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' })
		expect(FakeWorker.instances).toEqual([])
	})
})
