FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends libatomic1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV QVAC_DEVICE=cpu
EXPOSE 3000

CMD ["npm", "start"]
