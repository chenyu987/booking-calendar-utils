# Cloud Run 用的镜像（scripts/deploy.mjs 交给 Cloud Build 在云端打，本机不用装 Docker）。
# next.config.js 里 output: "standalone"：构建产物自带一个最小的 server.js 和用得到的依赖，
# 镜像里不用整份 node_modules。

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_ 开头的变量是**构建时**写进浏览器包的，所以从构建参数进来（不是密钥：
# 本来就是发给浏览器的）。连哪个库由它们决定，deploy.mjs 从 .env.local 读了传进来
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_TELEMETRY_DISABLED=1
# lib/supabase.ts 在模块加载时就要 service key，构建时收集页面信息会加载到它。
# 构建时给个假的（跟 CI 一样），**真的只在运行时从 Secret Manager 进来**，不进镜像
RUN SUPABASE_SERVICE_ROLE_KEY=build-placeholder npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=8080
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 8080
CMD ["node", "server.js"]
