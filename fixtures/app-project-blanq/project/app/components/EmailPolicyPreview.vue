<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  email: string
}>()

const policy = ref<{ accepted: boolean } | null>(null)

async function checkEmailPolicy(email: string) {
  if (!email) {
    policy.value = null
    return
  }

  policy.value = await $fetch('/api/auth/email-policy', {
    query: { email },
  })
}

watch(() => props.email, email => checkEmailPolicy(email), {
  immediate: true,
})
</script>

<template>
  <p
    v-if="email && policy"
    class="px-8 text-center text-xs text-muted-foreground"
  >
    Email policy preview:
    <span>{{ policy?.accepted ? 'accepted' : 'needs review' }}</span>
  </p>
</template>
