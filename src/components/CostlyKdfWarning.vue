<template>
	<NcNoteCard type="warning">
		{{ t('keenext', 'This database asks for an unusually expensive key derivation ({kdf}). Opening it may take minutes or never finish. Continue only if you expect these settings.', { kdf: description }) }}
	</NcNoteCard>
</template>

<script setup lang="ts">
import type { Kdf } from '@/core/database'

import { computed } from 'vue'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import { t } from '@/l10n'

const props = defineProps<{
	/** From CostlyKdfError */
	kdf: Kdf
}>()

const description = computed(() => {
	const kdf = props.kdf
	if (kdf.type === 'aes') {
		return t('keenext', 'AES-KDF, {rounds} rounds', { rounds: kdf.rounds.toLocaleString() })
	}
	return t('keenext', '{type}, {memory} MiB memory, {iterations} iterations', {
		type: kdf.type === 'argon2id' ? 'Argon2id' : 'Argon2d',
		memory: Math.round(kdf.memory / 1024 ** 2).toLocaleString(),
		iterations: kdf.iterations.toLocaleString(),
	})
})
</script>
