import express from "express";
import multer from "multer";
import { extractTextFromPDF } from "../services/PDFUtil.js";
import { evalCreditScoreSentiment } from "../services/AICreditAnalysis.js";
import { db } from "../lib/db.js";

export const creditScoreRouter = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

creditScoreRouter.post('/credit_score', upload.single('file'), async (req, res) => {
    if (!res.locals.user) {
        return res.status(401).send('Unauthorized');
    }

    if (res.locals.user.isAdmin) {
        console.log(`Detected admin user: ${res.locals.user.email}`);
    } else {
        return res.status(401).send('Unauthorized');
    }

    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: 'No file uploaded'
        });
    }

    const pdfBuffer = req.file.buffer;
    const pdfText = await extractTextFromPDF(pdfBuffer);
    console.log(pdfText);
    
    const creditScoreAnalysis = await evalCreditScoreSentiment(pdfText);


    return res.status(200).json({
        success: true,
        creditScore: creditScoreAnalysis
    });
});

