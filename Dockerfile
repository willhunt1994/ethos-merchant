FROM node:22-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

CMD ["pnpm", "run", "docker-start"]
