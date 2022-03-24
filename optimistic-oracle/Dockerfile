# Build stage: compile Javascript (optional, provided as example if using Babel)
# FROM node:14.15.5-alpine as builder
# WORKDIR /app
# COPY . .
# RUN npm ci
# RUN npm run build

# Final stage: install production dependencies
FROM nikolaik/python-nodejs:latest
ENV NODE_ENV=production
WORKDIR /app
LABEL "network.forta.settings.agent-logs.enable"="true"
COPY ./src ./src
COPY package*.json ./
RUN npm ci --production
CMD [ "npm", "run", "start:prod" ]
