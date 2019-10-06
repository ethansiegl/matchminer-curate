FROM node:8.16.0

COPY . .
RUN yarn install
