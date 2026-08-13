<script lang="ts" setup>
import { onMounted } from 'vue'
import { renderReferralSource } from '~/composables/useReferralSource'

definePageMeta({
  layout: 'auth',
})

const config = useAppConfig()
const referralSource = useReferralSource()

onMounted(() => {
  renderReferralSource()
})

useSeoMeta({
  title: `${config.appName} | Register`,
  description: `Create your ${config.appName} account`,
})
</script>

<template>
  <AuthPageContainer
    context-switch-link="/auth/login"
    context-switch-text="Login instead"
    form-title="Create your account"
    form-description="Get started with your account by filling out the information below."
  >
    <p
      v-if="referralSource"
      id="referral-source"
      class="px-8 text-center text-sm text-muted-foreground"
    />

    <AuthFormRegister />

    <p class="px-8 text-center text-sm text-muted-foreground">
      By clicking continue, you agree to our
      <a
        href="/terms"
        class="underline underline-offset-4 hover:text-primary"
      >
        Terms of Service
      </a>
      and
      <a
        href="/privacy"
        class="underline underline-offset-4 hover:text-primary"
      >
        Privacy Policy
      </a>
      .
    </p>
  </AuthPageContainer>
</template>
