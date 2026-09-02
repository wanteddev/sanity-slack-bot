FROM mcr.microsoft.com/playwright:v1.59.1-jammy

# PID 1 init — node가 PID 1이면 종료된 브라우저 자식(WPEWebProcess/chrome-headless)이 좀비로 누적됨
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
COPY e2e/ ./e2e/
COPY playwright.sanity.config.ts ./

RUN npm run build

# 루트 실행 회피 — Playwright 이미지가 제공하는 비루트 계정 사용
RUN chown -R pwuser:pwuser /app
USER pwuser

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/server.js"]
