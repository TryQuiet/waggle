FROM node:14

RUN apt update && apt install -y

WORKDIR /usr/app

RUN npm install -g node-pre-gyp@0.10.0 typescript ts-node
# Original:
ENV HIDDEN_SERVICE_SECRET=PT0gZWQyNTUxOXYxLXNlY3JldDogdHlwZTAgPT0AAADQZeSBmBABj5X+4zo98d+zOfFEygXVYajYaTzthFtLa4muclClSkstifM4SQsaJlFkJN//FZsBfMSLTDPubgCP
# Local:
# ENV HIDDEN_SERVICE_SECRET=PT0gZWQyNTUxOXYxLXNlY3JldDogdHlwZTAgPT0AAAAIHE5vko6EXn0zPKOZwcIsMePDG0xIKgguNqbPmgkeWlcBlHxzx7u1seu2E9MZF782a29E/moFq+EEphT3INOK

COPY package.json .
COPY package-lock.json .
RUN npm install
COPY . .
CMD ["ts-node", "src/entryNode.ts"]
