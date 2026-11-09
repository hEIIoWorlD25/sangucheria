
# ETAPA 1: Compilar Tailwind CSS
FROM node:24-bookworm-slim AS css-builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY src ./src
COPY public ./public
COPY tickets.js personal.js ./

RUN npm run build:css

# ETAPA 2: Aplicación de producción
FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY app.js database.js tickets.js personal.js ./
COPY lib ./lib
COPY --from=css-builder /app/public ./public

RUN mkdir -p /app/data && chown node:node /app/data

ENV HOST=0.0.0.0
ENV NODE_ENV=production

USER node

EXPOSE 3000

CMD ["node", "app.js"]
