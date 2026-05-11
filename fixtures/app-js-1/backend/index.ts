import express from "express";
// import { lucia } from "./lib/auth.js";
import { db, init } from "./lib/db.js";

import { bankProfileRouter } from "./routes/bank_profile.ts";
import { creditScoreRouter } from "./routes/credit_score.ts";
import { memosRouter } from "./routes/memos.ts";
import { userRouter } from "./routes/user.ts";
import { bankStatementsRouter } from "./routes/bank_statements.ts";
import { bankProfileTemplate } from "./routes/bank_profile_template.ts";
import { finchatRouter } from "./routes/finchat.ts";

import { toNodeHandler } from "better-auth/node";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./lib/auth.ts";

// establish a db connection first
await init();

const app = express();

app.all("/api/auth/*", toNodeHandler(auth));

app.use(express.json());

app.use(async (req, res, next) => {
	// load sessions and put it on res.locals with the user object
	const session = await auth.api.getSession({
	 headers: fromNodeHeaders(req.headers),
   });

   res.locals.user = session?.user;

   	if (session?.user && session?.user?.id) {
		const userAttribute = await db().get('SELECT role FROM user_profile WHERE user_id = ?', session.user.id);
		if (session?.user?.id && userAttribute?.role === 'admin') {
			res.locals.user.isAdmin = true;
		}
	}

   return next();
});

const apiRouter = express.Router();
apiRouter.use(memosRouter, 
	bankProfileRouter, userRouter, bankStatementsRouter, 
	bankProfileTemplate, creditScoreRouter, finchatRouter);
app.use("/api", apiRouter);

app.use('/data', (req, res, next) => {
	// respond with all CORS allowed headers for this route:
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
	res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
	res.setHeader('Access-Control-Allow-Credentials', 'true');
	
	const d = req.query.d;
	console.log('d', d);
	return res.send('Captured data');
})

app.listen(3005);

console.log("Server running on port 3005");

