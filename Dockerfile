FROM node:18.2.0-buster-slim

COPY . .

RUN npm install

ENTRYPOINT ["node", "/action.js"]