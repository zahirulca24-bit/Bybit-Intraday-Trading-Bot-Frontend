FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --ignore-scripts --no-audit --no-fund

COPY . .
RUN npm run typecheck && npm run build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/api ./api
COPY --from=build /app/cloud-run-server.ts ./cloud-run-server.ts

USER node
EXPOSE 8080

CMD ["npm", "start"]
