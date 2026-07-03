FROM node:20-bullseye-slim

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

RUN npm run prisma:generate && npm run build

EXPOSE 3000

CMD ["node", "server.js"]
