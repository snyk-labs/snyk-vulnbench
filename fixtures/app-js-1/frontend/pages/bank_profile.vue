<template>
    <div class="max-w-4xl">
        <Card>            
            <CardHeader>
                <CardTitle>Bank Profile</CardTitle>
                <CardDescription>Your financial profile profile
                </CardDescription>
            </CardHeader>
            <CardContent>

                <div v-if="loading" class="flex items-center space-x-4">
                    <Skeleton class="h-12 w-12 rounded-full" />
                    <div class="space-y-2">
                    <Skeleton class="h-4 w-[250px]" />
                    <Skeleton class="h-4 w-[200px]" />
                    </div>
                </div>

                <div v-else>
                    <div class="flex flex-col py-6" v-if="userData.role === 'admin'">
                        <Label class="py-2" for="customers">Select customer</Label>
                        <Select v-model="userId">
                            <SelectTrigger id="customers">
                                <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent position="popper">
                                <SelectGroup v-for="user in usersList"
                                    :key="user.id">
                                    <SelectItem :value="user.id">
                                        {{ user.full_name }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>

                    <form v-if="bank_profile_id" class="">
                        <div class="grid items-center w-full gap-4">
                            <div class="flex flex-col space-y-1.5">
                                <Label for="Opening Balance">Opening balance</Label>
                                <Input v-model="opening_balance"
                                    :disabled="userData.role !== 'admin'"
                                    id="opening_balance" />
                            </div>

                            <div class="flex flex-col space-y-1.5">
                                <Label for="Fee Per Transaction">Fee Per
                                    Transaction</Label>
                                <Input v-model="fee_per_transaction"
                                    :disabled="userData.role !== 'admin'"
                                    id="fee_per_transaction" />
                            </div>

                            <div class="flex flex-col space-y-1.5">
                                <Label for="Credit Limit">Credit Limit</Label>
                                <Input v-model="credit_limit"
                                    :disabled="userData.role !== 'admin'"
                                    id="credit_limit" />
                            </div>

                            <div class="flex flex-col space-y-1.5">
                                <Label for="Account Number">Account Number</Label>
                                <Input v-model="account_number" disabled
                                    id="account_number" />
                            </div>

                            <input type="hidden" :value="bank_profile_id" />
                        </div>
                    </form>
                </div>
            </CardContent>

            <CardFooter v-if="userData.role === 'user'"
                class="flex justify-end px-6 pb-6 gap-4">
                <Button :disabled="loading" @click="generateBankStatement">Generate Bank Statement</Button>
            </CardFooter>

            <CardFooter v-if="userData.role === 'admin'"
                class="flex justify-end px-6 pb-6 gap-4">

                <Button @click="exportPDF">
                        Export PDF
                        <ArrowUpRight class="h-4 w-4 ml-2" />
                </Button>

                <Button @click="save">Save</Button>
            </CardFooter>

            <CardFooter v-if="userData.role === 'admin'" class="border-t border-gray-200 px-6 py-4">
                <div>
                    <div class="flex items-center space-x-4">
                        <Button @click="analyzeCreditScore">
                                AI Credit Score Analysis
                                <DollarSign class="h-4 w-4 ml-2" />
                        </Button>
                        <Label for="file">PDF Upload: </Label>
                        <input type="file" @change="handleFileChange" />
                    </div>
                    <div class="mt-4">
                        <div v-if="loadingCreditScore">
                            Processing...
                            <Skeleton class="h-4 w-[250px]" />
                            <Skeleton class="h-4 w-[200px] mt-2" />
                        </div>
                        <div v-if="creditScoreResult && !loadingCreditScore">
                            *** Credit Score Analysis:
                            <span
                            :class="{'text-red-500': creditScoreResult === 'Poor',
                                   'text-yellow-500': creditScoreResult === 'Fair',
                                 'text-green-500': creditScoreResult === 'Excellent'}"
                             class="font-bold">
                                {{ creditScoreResult }}
                            </span>
                        </div>
                    </div>
                </div>
             </CardFooter>


        </Card>
    </div>

    <!-- PDF rendering iframe -->
    <iframe id="pdfExport" style="width: 100%; height: 500px;"></iframe>
</template>

<script setup lang="ts">
import { ArrowUpRight, DollarSign } from 'lucide-vue-next'
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Button } from "~/components/ui/button";
import { Skeleton } from '@/components/ui/skeleton'

const userData = useUserStore();

const userId = ref();
const usersList = ref([]);

const opening_balance = ref("");
const fee_per_transaction = ref("");
const credit_limit = ref("");
const account_number = ref("");
const bank_profile_id = ref("");

const creditScoreResult = ref("");
const loadingCreditScore = ref(false)
const loading = ref(false);

const selectedFile = ref<File | null>(null);

function handleFileChange(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
        selectedFile.value = target.files[0];
    }
}

async function analyzeCreditScore() {
    if (!selectedFile.value) {
        alert("Please select a file first.");
        return;
    }

    loadingCreditScore.value = true;

    const formData = new FormData();
    formData.append('file', selectedFile.value, selectedFile.value.name);
    formData.append('user_id', userId.value);

    const data = await $fetch('/api/credit_score', {
        method: 'POST',
        body: formData
    })

    creditScoreResult.value = data.creditScore;

    // do something with data
    loadingCreditScore.value = false;
}

async function exportPDF() {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();

  const searchParams = new URLSearchParams();
  searchParams.append('user_id', userId.value);

  let html = await $fetch(`/api/bank_profile_statement?${searchParams}`, {
    method: 'GET'
  })

  doc.fromHTML(
    html, 0, 0, {
      width: 100
  },
    function () {
      const pdfData = doc.output('datauristring');
      const iframe = document.getElementById('pdfExport') as HTMLIFrameElement;
      iframe.src = pdfData;
    });
}

onMounted(async () => {
    if (userData.role === 'admin') {
        const response = await $fetch("/api/users");
        usersList.value = response.users
    } else {
        userId.value = userData.user_id
    }
})

watch(userId, async () => {
    if (userId.value) {
        const data = await $fetch(`/api/bank_profile/${userId.value}`);

        opening_balance.value = data.bank_profile.opening_balance;
        fee_per_transaction.value = data.bank_profile.fee_per_transaction;
        credit_limit.value = data.bank_profile.credit_limit;
        account_number.value = data.bank_profile.account_number;
        bank_profile_id.value = data.bank_profile.id;
    }
});

const save = async () => {
    await $fetch('/api/bank_profile', {
        method: 'POST',
        body: {
            opening_balance: opening_balance.value,
            fee_per_transaction: fee_per_transaction.value,
            credit_limit: credit_limit.value,
            account_number: account_number.value,
            user_id: userId.value,
        }
    })

}


const generateBankStatement = async () => {

    loading.value = true;

    const data = await $fetch('/api/bank_statements', {
        method: 'POST',
        body: {
            user_id: userId.value
        }
    })

    loading.value = false;

    const report_name = data.report_name;
    window.open(`/api/bank_statements?report_name=${report_name}`, '_blank');
}



</script>
