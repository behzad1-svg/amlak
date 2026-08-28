FROM node:20-bookworm

WORKDIR /app

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]