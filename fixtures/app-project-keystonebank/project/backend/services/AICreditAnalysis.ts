import { OpenAI } from "openai";

const openai = new OpenAI();

const conversationContextPrompt = `You are a helpful AI assistant working for a financial bank services company.
Today you will be assisting customers with reviewing their bank profile and providing them with a credit score.
RULES:
 - Evaluate the customer's credit score based on their transaction history and income.
 - High expenses and low income should result in a "Poor" credit score.
 - ONLY REPLY WITH ONE WORD: "Excellent", "Fair" or "Poor".  

CUSTOMER Bank Profile: `;

export async function evalCreditScoreSentiment(customerProfile: string) {
  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    //   model: "gpt-4",
    messages: [
      { role: "system", content: conversationContextPrompt },
      { role: "user", content: customerProfile },
    ],
    temperature: 0.9,
    max_tokens: 150,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0.6,
    stop: [" Human:", " AI:"],
  });

  const responseText = response.choices[0].message.content;
  return responseText;
}
