FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY app.js database.js tickets.js personal.js ./
COPY public ./public

RUN mkdir -p /app/data && chown node:node /app/data

ENV HOST=0.0.0.0

USER node

EXPOSE 3000

CMD ["node", "app.js"]