import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { installArgon2 } from './core/crypto'
import { createWorkerArgon2 } from './services/argon2Worker'

installArgon2(createWorkerArgon2())

createApp(App)
	.use(createPinia())
	.mount('#keepassweb')
