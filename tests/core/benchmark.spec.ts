import type { Argon2Request } from '@/core/argon2'

import { describe, expect, it } from 'vitest'
import { argon2IterationsFor, MAX_BENCHMARK_ITERATIONS } from '@/core/benchmark'

/** A fake Argon2 taking `msPerIteration` on a fake clock. */
function fake(msPerIteration: number) {
	let clock = 0
	const requests: Argon2Request[] = []
	return {
		now: () => clock,
		requests,
		compute: async (request: Argon2Request) => {
			requests.push(request)
			clock += request.iterations * msPerIteration
			return new Uint8Array(32)
		},
	}
}

const settings = { type: 'argon2id', memory: 64 * 1024 * 1024, parallelism: 2 } as const

describe('argon2IterationsFor', () => {
	it('measures with more iterations until the sample is long enough, then scales', async () => {
		const argon = fake(20)
		expect(await argon2IterationsFor(argon.compute, settings, 1000, argon.now)).toBe(50)
		expect(argon.requests.map((request) => request.iterations)).toEqual([1, 4, 16])
		expect(argon.requests[0]).toMatchObject({ memory: 64 * 1024, parallelism: 2, type: 2, version: 0x13 })
	})

	it('keeps at least one and at most the limit', async () => {
		const slow = fake(5000)
		expect(await argon2IterationsFor(slow.compute, settings, 1000, slow.now)).toBe(1)
		const fast = fake(0.001)
		expect(await argon2IterationsFor(fast.compute, settings, 1000, fast.now)).toBe(MAX_BENCHMARK_ITERATIONS)
	})
})
