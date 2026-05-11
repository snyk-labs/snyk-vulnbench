create table "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null);

create table "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id"));

create table "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id"), "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);

create table "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date, "updatedAt" date);

-- create the admin user
curl -vX POST http://localhost:3005/api/auth/sign-up/email -H "Content-Type: application/json" -d '{"name": "Eugene Belford", "email": "eugene@gibson.com", "password": "admin1234"}'
-- create the regular user
curl -vX POST http://localhost:3005/api/auth/sign-up/email -H "Content-Type: application/json" -d '{"name": "Dade Murphy", "email": "dade@nyu.edu", "password": "hacktheplanet"}'

-- sign in:
curl http://localhost:3005/api/auth/sign-in/email \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{ "email": "dade@nyu.edu",  "password": "hacktheplanet" }'