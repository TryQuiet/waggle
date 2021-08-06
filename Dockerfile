FROM node:14

RUN apt-get update && apt-get upgrade -y
WORKDIR /usr/app

RUN npm install -g node-pre-gyp@0.10.0 typescript ts-node
# ENV PEERID_FILE=peerIdDockerNoTor.json
ENV DEBUG=logSync*,libp2p*
# ENV CREATE_SNAPSHOT=true

COPY package.json .
COPY package-lock.json .
RUN npm install
COPY . .
# VOLUME ["/usr/app/node_modules/orbit-db-store"]

CMD ["ts-node", "src/nodeTest/nodes.ts"]
