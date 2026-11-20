FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json
RUN npm install --omit=dev --workspace server --include-workspace-root=false || npm install

COPY server ./server
RUN cd server && npx prisma generate && npx tsc -p tsconfig.json

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/node_modules ./server/node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/prisma ./server/prisma
COPY server/package.json ./server/package.json
WORKDIR /app/server
EXPOSE 4000
CMD ["node", "dist/src/index.js"]
