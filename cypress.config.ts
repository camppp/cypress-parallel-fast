import { defineConfig } from 'cypress'

export default defineConfig({
  e2e: {
    specPattern: 'cypress/examples/**/*.spec.ts',
    supportFile: 'cypress/support/e2e.ts',
  },
})
