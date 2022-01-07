# Build stage: compile Javascript (optional, provided as example if using Babel)
# FROM node:14.15.5-alpine as builder
# WORKDIR /app
# COPY . .
# RUN npm ci
# RUN npm run build

# Final stage: install production dependencies
FROM nikolaik/python-nodejs:python3.7-nodejs14-slim
ENV NODE_ENV=production
WORKDIR /app
RUN echo 'debconf debconf/frontend select Noninteractive' | debconf-set-selections
RUN apt-get update && apt-get install -y -q apt-utils
RUN apt-get install -y -q git build-essential
COPY ./src ./src
COPY agent-config.json ./
COPY package*.json ./
RUN npm ci --production
CMD [ "npm", "run", "start:prod" ]
