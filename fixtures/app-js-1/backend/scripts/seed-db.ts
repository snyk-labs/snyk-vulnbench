import { db, init } from "../lib/db.js";
// import { hash } from "@node-rs/argon2";
// import { generateId } from "lucia";

import { auth } from "../lib/auth.ts";

await init();

function generateRandomID(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() *
            charactersLength));
    }
    return result;
}

const users = [
    {
        password: "admin1234",
        role: "admin",
        full_name: "Eugene Belford",
        address: "5 Wallstreet Avenue, New York, NY 10003",
        phone_number: "(212) 998-5117",
        email: "eugene@gibson.com"
    },
    {
        password: "hacktheplanet",
        role: "user",
        full_name: "Dade Murphy",
        address: "1 Washington Square, New York, NY 97211",
        phone_number: "(212) 998-1337",
        email: "dade@nyu.edu"
    },
]


// create necessary tables
await db().exec(`
    CREATE TABLE IF NOT EXISTS users (
    id TEXT NOT NULL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user'
    );
    INSERT INTO users (id, username, password, role) VALUES (1, 'admin', '1234', 'admin');
`);

await db().exec(`
    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      address TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      FOREIGN KEY(user_id) REFERENCES user(id)
    )
`);

await db().exec(`
    CREATE TABLE IF NOT EXISTS memos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      text TEXT NOT NULL,
      meta TEXT NOT NULL DEFAULT '{}',
      date TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES user(id)
    )
`);

await db().exec(`
    CREATE TABLE IF NOT EXISTS bank_profile (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      opening_balance TEXT NOT NULL,
      fee_per_transaction TEXT NOT NULL,
      credit_limit TEXT NOT NULL,
      account_number TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES user(id)
    )
`);

await db().exec(`
    CREATE TABLE IF NOT EXISTS chat_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      request TEXT,
      response TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES user(id)
    )
`);


const usersInDatabase = await db().get('SELECT COUNT(*) as count FROM user');

if (usersInDatabase.count <= 0) {
    for (const user of users) {

        console.log(`Creating user: ${user.email}`);

        const response = await auth.api.signUpEmail({
            returnHeaders: false,
            body: {
                email: user.email,
                password: user.password,
                name: user.full_name
            },
        });

        console.log(response);
        const userId = response.user.id;

        console.log(`Creating user profile for: ${user.email}`);
        await db().get(`
            INSERT INTO user_profile (user_id, full_name, email, address, phone_number, role)
            VALUES(?, ?, ?, ?, ?, ?)`,
                userId,
                user.full_name,
                user.email,
                user.address,
                user.phone_number,
                user.role
        );

        console.log(`Creating bank profile for: ${user.email}`);
        await db().run(`
            INSERT INTO bank_profile
            (user_id, opening_balance, fee_per_transaction, credit_limit, account_number)
            VALUES(?, ?, ?, ?, ?)`,
                userId,
                100,
                1,
                5000,
                generateRandomID(6)
        );
    }
    
}
