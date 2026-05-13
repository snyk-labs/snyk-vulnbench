<template>
    <div class="max-w-4xl">
        <Card>
            <CardHeader>
                <CardTitle>Financial Assistant</CardTitle>
                <CardDescription>Ask me anything about your banking needs</CardDescription>
            </CardHeader>
            <CardContent>
                <div class="space-y-4">
                    <div v-for="(message, index) in messages" :key="index" class="flex gap-3">
                        <Avatar class="h-9 w-9">
                            <AvatarImage :src="message.role === 'assistant' ? '/avatars/bot.png' : '/avatars/user.png'" />
                            <AvatarFallback>{{ message.role === 'assistant' ? 'AI' : 'Me' }}</AvatarFallback>
                        </Avatar>
                        <div class="grid gap-1">
                            <p class="font-semibold">{{ message.role === 'assistant' ? 'Assistant' : 'You' }}</p>
                            <div v-if="message.role === 'assistant'" class="text-sm prose dark:prose-invert max-w-none">
                                <MDC :value="message.content" />
                            </div>
                            <p v-else class="text-sm">{{ message.content }}</p>
                        </div>
                    </div>
                </div>
            </CardContent>
            <CardFooter>
                <form @submit.prevent="sendMessage" class="flex w-full gap-2">
                    <Input 
                        v-model="userInput"
                        placeholder="Type your message..."
                        :disabled="isLoading"
                        class="flex-1"
                    />
                    <Button type="submit" :disabled="isLoading || !userInput">
                        <span v-if="isLoading" class="flex items-center">
                            <LoaderIcon class="h-4 w-4 animate-spin" />
                            <span class="ml-2">Thinking...</span>
                        </span>
                        <span v-else>Send</span>
                    </Button>
                </form>
            </CardFooter>
        </Card>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { LoaderIcon } from 'lucide-vue-next'
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import { Avatar, AvatarImage, AvatarFallback } from '~/components/ui/avatar'
import { MDC } from '#components'

interface Message {
    content: string
    role: 'user' | 'assistant'
}

interface ChatResponse {
    success: boolean;
    message: string;
}

const messages = ref<Message[]>([
    {
        content: "Hello! I'm your financial assistant. How can I help you today?",
        role: 'assistant'
    }
])

const userInput = ref('')
const isLoading = ref(false)

const sendMessage = async () => {
    if (!userInput.value.trim() || isLoading.value) return

    // Add user message
    messages.value.push({
        content: userInput.value,
        role: 'user'
    })

    isLoading.value = true
    
    try {
        const response = await $fetch<ChatResponse>('/api/finchat', {
            method: 'POST',
            body: {
                messages: messages.value
            }
        })

        // Add bot response
        messages.value.push({
            content: response.message,
            role: 'assistant'
        })
    } catch (error) {
        messages.value.push({
            content: "I apologize, but I'm having trouble responding right now. Please try again later.",
            role: 'assistant'
        })
    } finally {
        userInput.value = ''
        isLoading.value = false
    }
}
</script>

<style>
.prose {
    line-height: 1.6;
}

.prose p {
    margin-bottom: 0.5em;
}

.prose code {
    background-color: rgba(0, 0, 0, 0.1);
    padding: 0.2em 0.4em;
    border-radius: 3px;
    font-size: 0.9em;
}

.prose pre {
    background-color: rgba(0, 0, 0, 0.1);
    padding: 1em;
    border-radius: 5px;
    overflow-x: auto;
}

.dark .prose code {
    background-color: rgba(255, 255, 255, 0.1);
}

.dark .prose pre {
    background-color: rgba(255, 255, 255, 0.1);
}
</style>