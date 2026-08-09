FROM node:18.10.0-bullseye
EXPOSE 3000
EXPOSE 3004
WORKDIR /app
COPY package-lock.json ./
COPY package.json ./
RUN npm ci
COPY ./ ./
CMD ["npm", "run", "start"]