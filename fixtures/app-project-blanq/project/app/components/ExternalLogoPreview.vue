<script setup lang="ts">
import { onMounted, ref } from 'vue'

const route = useRoute()
const logoUrl = ref(String(route.query.logoUrl || ''))
const preview = ref<{
  url: string
  status: number
  contentType: string
  imageDataUrl: string | null
} | null>(null)

async function loadPreview() {
  if (!logoUrl.value) {
    preview.value = null
    return
  }

  preview.value = await $fetch('/api/integrations/logo-preview', {
    query: { url: logoUrl.value },
  })
}

onMounted(() => {
  if (logoUrl.value) {
    loadPreview()
  }
})
</script>

<template>
  <div class="mx-auto mt-6 max-w-xl rounded-md border bg-white/60 p-4 text-left text-sm dark:bg-background/60">
    <p class="font-medium">
      Partner logo preview
    </p>
    <div class="mt-3 flex gap-2">
      <input
        v-model="logoUrl"
        class="min-w-0 flex-1 rounded-md border bg-background px-3 py-2"
        placeholder="https://cdn.example.com/logo.png"
        type="url"
      >
      <button class="rounded-md border px-3 py-2" type="button" @click="loadPreview">
        Preview
      </button>
    </div>
    <img
      v-if="preview?.imageDataUrl"
      :src="preview.imageDataUrl"
      alt="Partner logo preview"
      class="mt-4 h-20 w-20 rounded object-contain"
    >
    <p v-if="preview" class="mt-2 text-xs text-muted-foreground">
      {{ preview.contentType }} · HTTP {{ preview.status }}
    </p>
  </div>
</template>
