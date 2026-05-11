<template>


<div class="flex align-middle text-center justify-center pt-24">
        <Card class="">
            <CardHeader>
                <CardTitle>App Login</CardTitle>
                <CardDescription>Welcome to FinServ Banking</CardDescription>
            </CardHeader>
            <CardContent>

              <div class="grid items-center w-full gap-4">
                <form @submit.prevent="handleSubmit">

                  <div class="grid items-center w-full gap-4">
                        <div class="flex flex-col space-y-1.5 text-left">
                            <Label for="username">Username</Label>
                            <Input v-model="username"
                                required
                                id="username" />
                        </div>
                        <div class="flex flex-col space-y-1.5 text-left">
                          <Label for="password">Password</Label>
                            <Input v-model="password"
                                type="password"
                                required
                                id="password" />
                        </div>
                  </div>
                  
                </form>
              </div>

            </CardContent>
            <CardFooter>
                <Button @click="handleSubmit">Login</Button>
            </CardFooter>
            <div class="block p-4">
              <p v-if="errorMessage" class="text-red-500">Login error</p>
            </div>
        </Card>
    </div>
</template>

<script setup lang="ts">

definePageMeta({
  layout: 'anonymous',
})

import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useFetch } from 'nuxt/app';

const username = ref('');
const password = ref('');
const errorMessage = ref('');
const router = useRouter();

const handleSubmit = async () => {
  errorMessage.value = '';
  try {
    const { data, error } = await useFetch('/api/auth/sign-in/email', {
      method: 'POST',
      body: { email: username.value, password: password.value },
    });

    if (error.value) {
      errorMessage.value = error.value.message;
    } else if (data.value.token) {
    
        // @TBD replace native DOM API with native vue-router API
        // `router.push('/');` once we add proper reactivity to the app
        window.location.href = '/';
    } else {
      errorMessage.value = error.value.message;
    }
  } catch (err) {
    errorMessage.value = 'An error occurred. Please try again.';
  }
};
</script>