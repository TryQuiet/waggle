FROM node:14

RUN apt update && apt install -y

WORKDIR /usr/app

RUN npm install -g node-pre-gyp@0.10.0 typescript ts-node
ENV HIDDEN_SERVICE_SECRET=ED25519-V3:cHmSdEN9gCrNiYkm5xw7wP94SsWVHc3QEHJ6Y76Hw2nENv/Qwo71YCVbezoCqneiPIuNLnybgM221Z7Ds608Cw==

COPY package.json .
COPY package-lock.json .
RUN npm install
COPY . .
CMD ["ts-node", "src/entryNode.ts"]
