FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV QVAC_DEVICE=cpu
EXPOSE 3000

CMD ["npm", "start"]
