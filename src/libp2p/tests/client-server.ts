import pipe from 'it-pipe'
import https from 'https'
import { Time, getCrypto, CryptoEngine, setEngine } from 'pkijs'
import WebSocket from 'it-ws'
import WebSocketServer from 'it-ws/server'

import fs from 'fs'
import { Crypto } from '@peculiar/webcrypto'

import { createUserCert, createUserCsr, createRootCA, verifyUserCert, configCrypto } from '@zbayapp/identity'

// ---------------------------- section with creating pems

function dumpPEM(tag: string, body, path: string) {
  const result = (
    `-----BEGIN ${tag}-----\n` +
    `${formatPEM(Buffer.from(body).toString('base64'))}\n` +
    `-----END ${tag}-----\n`
  )
  fs.writeFileSync(`testingFixtures/certificates/files2/${path}`, result)
  return Buffer.from(result)
}

function formatPEM(pemString: string) {
  const stringLength = pemString.length
  let resultString = ''
  for (let i = 0, count = 0; i < stringLength; i++, count++) {
    if (count > 63) {
      resultString = `${resultString}\n`
      count = 0
    }
    resultString = `${resultString}${pemString[i]}`
  }
  return resultString
}

export const createPems = async (onion1, onion2) => {
  const userData = {
    zbayNickname: 'dev99damian1',
    commonName: onion1,
    peerId: 'Qmf3ySkYqLET9xtAtDzvAr5Pp3egK1H3C5iJAZm1SpLert',
    dmPublicKey: 'dmPublicKey1',
    signAlg: configCrypto.signAlg,
    hashAlg: configCrypto.hashAlg
  }

  const userData2 = {
    zbayNickname: 'dev99damian2',
    commonName: onion2,
    peerId: 'Qmf3ySkYqLET9xtAtDzvAr5Pp3egK1H3C5iJAZm1SpLEp6',
    dmPublicKey: 'dmPublicKey2',
    signAlg: configCrypto.signAlg,
    hashAlg: configCrypto.hashAlg
  }

  const notBeforeDate = new Date(Date.UTC(2010, 11, 28, 10, 10, 10))
  const notAfterDate = new Date(Date.UTC(2030, 11, 28, 10, 10, 10))

  const rootCert = await createRootCA(new Time({ type: 0, value: notBeforeDate }), new Time({ type: 0, value: notAfterDate }))

  const user = await createUserCsr(userData)
  const userCert = await createUserCert(rootCert.rootCertString, rootCert.rootKeyString, user.userCsr, notBeforeDate, notAfterDate)

  const user2 = await createUserCsr(userData2)
  const userCert2 = await createUserCert(rootCert.rootCertString, rootCert.rootKeyString, user2.userCsr, notBeforeDate, notAfterDate)

  const pems = {
    ca: dumpPEM('CERTIFICATE', rootCert.rootObject.certificate.toSchema(true).toBER(false), 'ca.pem'),
    ca_key: dumpPEM('PRIVATE KEY', await getCrypto().exportKey('pkcs8', rootCert.rootObject.privateKey), 'ca_key.pem'),

    servKey: dumpPEM('PRIVATE KEY', await getCrypto().exportKey('pkcs8', user.pkcs10.privateKey), 'servKey.pem'),
    servCert: dumpPEM('CERTIFICATE', userCert.userCertObject.certificate.toSchema(true).toBER(false), 'servCert.pem'),

    userKey: dumpPEM('PRIVATE KEY', await getCrypto().exportKey('pkcs8', user2.pkcs10.privateKey), 'userKey.pem'),
    userCert: dumpPEM('CERTIFICATE', userCert2.userCertObject.certificate.toSchema(true).toBER(false), 'userCert.pem')
  }

  const result1 = await verifyUserCert(
    rootCert.rootCertString,
    userCert.userCertString
  )

  const result2 = await verifyUserCert(
    rootCert.rootCertString,
    userCert2.userCertString
  )

  console.log('cert 1 valid ', result1.result)
  console.log('cert 2 valid ', result2.result)

  return pems
}

const sanityCheck = {
  ca: fs.readFileSync('testingFixtures/certificates/files/ca-certificate.pem'),
  ca_key: fs.readFileSync('testingFixtures/certificates/files/ca-key.pem'),
  servKey: fs.readFileSync('testingFixtures/certificates/files/key.pem'),
  servCert: fs.readFileSync('testingFixtures/certificates/files/certificate.pem'),
  userKey: fs.readFileSync('testingFixtures/certificates/files/client-key.pem'),
  userCert: fs.readFileSync('testingFixtures/certificates/files/client-certificate.pem')
}

// --------------------------------- section with client-server connection

const server = async (pems) => {
  const server = https.createServer({
    cert: pems.servCert,
    key: pems.servKey,
    ca: [pems.ca],
    requestCert: false
  })
  const wss = WebSocketServer({ server: server, verifyClient: () => true })
  await wss.listen(8081)
  wss.on('connection', function connection() {
    console.log('client connected')
  })
}

const client = async (pems) => {
  const stream = WebSocket.connect('wss://localhost:8081', {
    websocket: {
      cert: pems.userCert,
      key: pems.userKey,
      ca: [pems.ca],
      rejectUnauthorized: false
    }
  })
  await stream.connected()
    .catch((err) => {
      if (err) return console.log(err)
    })
  pipe(stream, stream, stream)
}

const start = async () => {
  const webcrypto = new Crypto()
  setEngine('newEngine', webcrypto, new CryptoEngine({
    name: '',
    crypto: webcrypto,
    subtle: webcrypto.subtle
  }))

  //const pems = await createPems()
  await server(sanityCheck)
  await client(sanityCheck)
}
/* eslint-disable */
start()
