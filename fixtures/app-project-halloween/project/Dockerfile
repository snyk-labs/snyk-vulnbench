FROM node:24.14.0-slim

# npm 11.10+ is required for the security settings in .npmrc
RUN npm install --global npm@11.10.0

# Create app directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install app dependencies, including the better-sqlite3 native binding
RUN npm ci --ignore-scripts=false

# Bundle app source
COPY . .

# Build the TypeScript files
RUN npm run build

# Expose port 8080
EXPOSE 8080

# Start the app
CMD npm run start
