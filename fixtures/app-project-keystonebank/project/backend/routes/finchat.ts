import express from "express";
import { OpenAI } from "openai";
import { db } from "../lib/db.ts";

const openai = new OpenAI();

export const finchatRouter = express.Router();

finchatRouter.post('/finchat', async (req, res) => {

    if (!res.locals.user) {
        return res.status(401).send('Unauthorized');
    }

    const { messages } = req.body;
    const userId = res.locals.user.id;

    const systemPrompt = `You are a financial assistant of
FinServ Banking bank. You are an AI designed to provide financial advice
and support to customers. Your responses should be informative, and helpful.
You should also be able to answer questions about banking queries, and
financial planning.`

    const chatMessages = [
        {
            role: "system",
            content: systemPrompt,
        },
        ...messages,
    ]

    const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: chatMessages,
    });

    const aiResponse = response.choices[0].message.content;

    const timestamp = new Date().toISOString();
    const auditSQL = 'INSERT INTO chat_audit_logs (user_id, timestamp, response) VALUES ("' + userId + '", "' + timestamp + '", "' + aiResponse + '")';

    try {
        await db().exec(auditSQL);

        return res.status(200).json({
            success: true,
            message: aiResponse,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).send('Internal server error');
    }
});

