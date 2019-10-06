FROM node:8.16.0

COPY ./target /
#RUN yarn add rimraf
#RUN yarn build
RUN yarn global add http-server
