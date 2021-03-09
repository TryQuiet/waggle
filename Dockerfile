FROM node:14

RUN apt update && apt install -y

WORKDIR /usr/app

RUN npm install -g node-pre-gyp@0.10.0 typescript ts-node
ENV HIDDEN_SERVICE_SECRET=PT0gZWQyNTUxOXYxLXNlY3JldDogdHlwZTAgPT0AAADQZeSBmBABj5X+4zo98d+zOfFEygXVYajYaTzthFtLa4muclClSkstifM4SQsaJlFkJN//FZsBfMSLTDPubgCP

COPY package.json .
COPY package-lock.json .
RUN npm install
COPY . .
CMD ["ts-node", "src/entryNode.ts"]
