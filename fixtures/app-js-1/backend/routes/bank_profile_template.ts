import express from "express";
import { db } from "../lib/db.js";

export const bankProfileTemplate = express.Router();

bankProfileTemplate.get('/bank_profile_statement', async (req, res) => {
    if (!res.locals.user) {
        return res.status(401).send('Unauthorized');
    }

    const user_id = req.query.user_id;
    const bankProfile = await db().get(`SELECT * FROM user_profile WHERE user_id = ?`, user_id);

    const htmlTemplate = `
    <html>
    <body>
        <h1>Bank Profile</h1>
        <p>Bank Name: FinServ Banking</p>

        <h2>Hello ${bankProfile.full_name}</h2>
        <p>${bankProfile.address}</p>
    </body>
    </html>
    `;


    return res.status(200).send(htmlTemplate);
});