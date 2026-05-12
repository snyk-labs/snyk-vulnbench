import { betterAuth } from "better-auth";
import { openAPI } from "better-auth/plugins";
import Database from "better-sqlite3";
 
export const auth = betterAuth({
    database: new Database("./database.db"),
	trustedOrigins: [
		"http://localhost:3000",
		"http://localhost:3005",
	],
	emailAndPassword: {  
        enabled: true
    },
	plugins: [
		openAPI(),
	]
});