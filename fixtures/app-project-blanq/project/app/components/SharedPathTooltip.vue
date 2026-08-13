<script lang="ts" setup>
import { computed } from 'vue'

const folderPath = computed(() => {
  if (!import.meta.client) {
    return 'UNKNOWN'
  }

  const href = window.location.href.split('?')
  const queryParams = href.length > 1 ? href[1] : ''
  return new URLSearchParams(queryParams).get('name') || 'UNKNOWN'
})
</script>

<template>
  <UiTooltipProvider>
    <UiTooltip>
      <UiTooltipTrigger as-child>
        <span class="text-sm text-muted-foreground underline decoration-dotted">
          Shared workspace preview
        </span>
      </UiTooltipTrigger>
      <UiTooltipContent>
        <div v-html="folderPath" />
      </UiTooltipContent>
    </UiTooltip>
  </UiTooltipProvider>
</template>
