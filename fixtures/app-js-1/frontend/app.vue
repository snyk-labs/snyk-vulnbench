<template>
    <div>
        <div v-if="loading" class="h-screen w-screen flex justify-center items-center">
            Loading ...
        </div>
        <NuxtLayout v-else>
            <NuxtPage />
        </NuxtLayout>
    </div>
</template>

<script setup lang="ts">

const router = useRouter()

let loading = ref(true)
let loggedIn = ref(false)

const userData = useUserStore();

onMounted(async () => {
    await callOnce(userData.fetchUser)
    if (userData.user_id) {
        loggedIn.value = true
        loading.value = false
    } else {
        loading.value = false;
        router.push('/login')
    }
})

</script>