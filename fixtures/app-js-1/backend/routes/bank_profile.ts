import express from "express";
import { db } from "../lib/db.js";

export const bankProfileRouter = express.Router();

bankProfileRouter.get('/bank_profile/:id', async (req, res) => {
    if (!res.locals.user) {
        return res.status(401).send('Unauthorized');
    }

    const user_id = req.params.id

    const bankProfile = await db().get(`SELECT * FROM bank_profile WHERE user_id = ?`, user_id);

    return res.status(200).json({
        success: true,
        bank_profile: bankProfile
    });
});

bankProfileRouter.post('/bank_profile', async (req, res) => {
    if (!res.locals.user) {
        return res.status(401).send('Unauthorized');
    }

    if (res.locals.user.isAdmin) {
        console.log(`Detected admin user: ${res.locals.user.email}`);
    } else {
        return res.status(401).send('Unauthorized');
    }

    const fieldsToUpdate = [];
    const params = { ['@account_number']: req.body.account_number };

    if (req.body.opening_balance !== undefined) {
        fieldsToUpdate.push('opening_balance = @opening_balance');
        params['@opening_balance'] = req.body.opening_balance;
    }
    if (req.body.fee_per_transaction !== undefined) {
        fieldsToUpdate.push('fee_per_transaction = @fee_per_transaction');
        params['@fee_per_transaction'] = req.body.fee_per_transaction;
    }
    if (req.body.credit_limit !== undefined) {
        fieldsToUpdate.push('credit_limit = @credit_limit');
        params['@credit_limit'] = req.body.credit_limit;
    }

    if (fieldsToUpdate.length === 0) {
        return res.status(400).send('No fields to update');
    }

    const query = `
        UPDATE bank_profile
        SET ${fieldsToUpdate.join(', ')}
        WHERE account_number = @account_number
    `;

    const dbStatement = await db().prepare(query); 
    await dbStatement.all(params);

    return res.status(200).json({
        success: true
    });
});

