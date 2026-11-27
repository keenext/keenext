import type { Argon2Compute } from './argon2.ts'
import type { KdfSettings } from './database.ts'

/** Runs shorter than this are measured again with more iterations; timer resolution and warm-up would dominate. */
const MIN_SAMPLE_MS = 200
const MAX_SAMPLE_ITERATIONS = 64
export const MAX_BENCHMARK_ITERATIONS = 10_000

/**
 * Argon2 iterations that take about `targetMs` in this browser at the given
 * memory and parallelism. KeePassXC and other native clients derive faster.
 */
export async function argon2IterationsFor(
	compute: Argon2Compute,
	settings: Pick<KdfSettings, 'type' | 'memory' | 'parallelism'>,
	targetMs: number,
	now: () => number = () => performance.now(),
): Promise<number> {
	let iterations = 1
	let elapsed: number
	for (;;) {
		const start = now()
		await compute({
			password: crypto.getRandomValues(new Uint8Array(32)),
			salt: crypto.getRandomValues(new Uint8Array(32)),
			memory: Math.round(settings.memory / 1024),
			iterations,
			length: 32,
			parallelism: settings.parallelism,
			type: settings.type === 'argon2id' ? 2 : 0,
			version: 0x13,
		})
		elapsed = now() - start
		if (elapsed >= MIN_SAMPLE_MS || iterations >= MAX_SAMPLE_ITERATIONS) {
			break
		}
		iterations *= 4
	}
	const scaled = Math.round(iterations * targetMs / Math.max(elapsed, 1))
	return Math.min(MAX_BENCHMARK_ITERATIONS, Math.max(1, scaled))
}
