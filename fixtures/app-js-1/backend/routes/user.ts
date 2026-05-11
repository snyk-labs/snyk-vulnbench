import express from "express";
import { db } from "../lib/db.js";

export const userRouter = express.Router();

userRouter.get('/user', async (req, res) => {

    if (!res.locals.user) {
        return res.status(401).send('Unauthorized');
    }

    const userProfile = await db().get(`SELECT * FROM user_profile
        JOIN user ON user_profile.user_id = user.id
        WHERE user_id = ?`, res.locals.user.id);

    return res.status(200).json({
        user_id: res.locals.user.id,
        full_name: userProfile.full_name,
        email: userProfile.email,
        address: userProfile.address,
        phone_number: userProfile.phone_number,
        role: userProfile.role
    })
});

userRouter.get('/users', async (req, res) => {
    if (!res.locals.user) {
        return res.status(401).send('Unauthorized');
    }

    if (!res.locals.user.isAdmin) {
        return res.status(401).send('Unauthorized');
    }

    const users = await db().all(`SELECT user.id as id,
        user_profile.full_name as full_name, bank_profile.id as bank_profile_id 
        FROM user
        JOIN user_profile ON user.id = user_profile.user_id
        JOIN bank_profile ON user.id = bank_profile.user_id
        `)

    return res.status(200).json({
        status: 'success',
        users
    })
});