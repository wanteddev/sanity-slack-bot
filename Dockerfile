FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

COPY package.json yarn.lock* ./
RUN npm install --production=false

COPY tsconfig.json ./
COPY src/ ./src/
COPY e2e/ ./e2e/
COPY playwright.sanity.config.ts ./

RUN npm run build

CMD ["node", "dist/server.js"]
