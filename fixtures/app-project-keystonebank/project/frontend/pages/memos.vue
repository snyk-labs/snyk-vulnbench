<template>
  <div class="max-w-4xl">
    <Card>
        <CardHeader>
        <CardTitle>Memo to bank teller</CardTitle>
        <CardDescription>Caution: do not share personally identifying information.</CardDescription>
        </CardHeader>
        <CardContent>
        <form>
            <div class="grid items-center w-full gap-4">
              <div class="flex flex-col space-y-1.5">
                  <Label for="text">Memo</Label>
                  <Textarea
                      v-model="text"
                      id="text"
                      placeholder="What can we help you with today?"
                      class="min-h-24"
                  />
              </div>
              <div class="flex flex-col space-y-1.5">
                  <Label for="Phone">Callback phone number</Label>
                  <Input v-model="phone" id="phone" />
              </div>
              <div class="flex flex-col space-y-1.5">
                  <Label for="urgency">Urgency</Label>
                  <Select v-model="urgency">
                  <SelectTrigger id="urgency">
                      <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                      <SelectItem value="low">
                      Low
                      </SelectItem>
                      <SelectItem value="medium">
                      Medium
                      </SelectItem>
                      <SelectItem value="high">
                      High
                      </SelectItem>
                  </SelectContent>
                  </Select>
              </div>
            </div>
        </form>
        </CardContent>
        <CardFooter class="flex justify-end px-6 pb-6">
        <Button @click="sendMemo" >Send</Button>
        </CardFooter>
    </Card>

    <hr class="m-10"/>

    <Card class="max-w-4xl mt-4" v-for="memo in parsedMemos" :key="memo.id">
    <CardContent>
        <div class="flex items-center gap-4 mt-4">
          <Avatar class="hidden h-9 w-9 sm:flex">
            <AvatarImage src="/avatars/01.png" alt="Avatar" />
            <AvatarFallback>OM</AvatarFallback>
          </Avatar>
          <div class="grid gap-1">
            <p class="text-sm">
              <span class="font-bold">{{memo.full_name}}</span>: {{ memo.text }}
            </p>
          </div>
        </div>
    </CardContent>
    <CardFooter>
      <div class="flex flex-row">
        <Badge variant="outline" class="flex text-center">
          Customer contact information
        </Badge>
        <div class="flex mx-5">
          <span class="mx-4"><span class="font-bold block">Phone:</span> {{ memo.meta.phone_number }}</span>
          <span class="mx-4"><span class="font-bold block">Callback number:</span> {{ memo.meta.callback_phone_number }}</span>
          <span class="mx-4"><span class="font-bold block">Urgency:</span> <span :class="{'text-danger': memo.meta.urgency === 'high', 'text-warning': memo.meta.urgency === 'medium', 'text-ok': memo.meta.urgency === 'low'}"> {{ memo.meta.urgency }}</span></span>
        </div>
      </div>
    </CardFooter>
  </Card>

  </div>
</template>

<script setup lang='ts'>
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Button } from '~/components/ui/button'
import { Textarea } from '~/components/ui/textarea'

const { data, refresh } = await useFetch('/api/memos');

const text = defineModel('text');
const phone = defineModel('phone');
const urgency = defineModel('urgency');

const sendMemo = async () => {
  
  const response = await $fetch('/api/memos', {
    method: 'POST',
    body: {
      text: text.value,
      meta: JSON.stringify({
        callback_phone_number: phone.value,
        urgency: urgency.value
      })
    }
  })

  if (response?.success === true) {
    text.value = ''
    phone.value = ''
    urgency.value = ''
    refresh()
  }

}

const parsedMemos = computed(() => {
  
  return data?.value?.memos?.map((memo) => {
    return {
      ...memo,
      meta: JSON.parse(memo.meta),
    };
  });
});

</script>

<style scoped>
.text-danger {
  color: red;
}

.text-warning {
  color: orange;
}

.text-ok {
  color: green;
}
</style>