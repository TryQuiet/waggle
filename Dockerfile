FROM node:14

RUN apt-get update && apt-get upgrade -y
WORKDIR /usr/app

RUN npm install -g node-pre-gyp@0.10.0 typescript ts-node
# Overwritten on aws for entry node:
ENV HIDDEN_SERVICE_SECRET=ED25519-V3:qGBgi+34Yf62ORFAA5hZ+SKGEXW2m3/EZmyjeU3rUXO4ZfXBnkhWn0Txaa2QoxcSQlSlcNgEZxazCO17nEBNcg==
# ENV HIDDEN_SERVICE_SECRET_REGISTRATION=ED25519-V3:cGYs+GzhgL/34o7nPr2MLvm+szUA5yV6CdXe8RFj0FBIqHUUKQxx/dJKopHjTZAsbgqc/WzMp7qAIVA1ZPVxBA==
ENV PEERID_FILE=peerIdDocker.json
ENV DEBUG=logSync*
ENV SAVE_SNAPSHOT=true

COPY package.json .
COPY package-lock.json .
RUN npm install
COPY . .
# VOLUME ["/usr/app/node_modules/orbit-db-store"]

CMD ["ts-node", "src/entryNode.ts"]
