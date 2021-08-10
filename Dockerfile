FROM node:14

RUN apt-get update && apt-get upgrade -y
WORKDIR /usr/app

RUN npm install -g node-pre-gyp@0.10.0 typescript ts-node
ENV HIDDEN_SERVICE_SECRET=ED25519-V3:+OQSh718QNMfTV+jpsO1moEjSRVnHvPOlEhS1WKdGGkP0OPwMG0iXWx6FJ9liCsbhJGFwLg/I13v6qhB8KVv5Q==
# ENV PEERID_FILE=peerIdDockerNoTor.json
ENV PEERID_FILE=localEntryNodePeerId.json
ENV DEBUG=logSync*,waggle*
ENV CREATE_SNAPSHOT=true
ENV USE_SNAPSHOT=true
ENV USE_TOR=true
ENV BOOTSTRAP_ADDRS=/dns4/ix2oumqrtjaupt53l6cqpk6ct6iaa5guconwgtvgdk2v3i5wjiyehryd.onion/tcp/7788/ws/p2p/QmRbkBkhTt2DbLMF8kAaf1oxpfKQuEfLKFzVCDzQhabwkw

COPY package.json .
COPY package-lock.json .
RUN npm install
COPY . .
# VOLUME ["/usr/app/node_modules/orbit-db-store"]

CMD ["ts-node", "src/nodeTest/run.ts"]
