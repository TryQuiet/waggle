import WebsocketsOverTor from './websocketOverTor'
import Multiaddr from 'multiaddr'
import { getPorts } from '../utils'
import { Tor } from '../torManager/index'
import os from 'os'
import fs from 'fs'
import fp from 'find-free-port'
import * as utils from '../utils'
import https from 'https'
import SocksProxyAgent from './socksProxyAgent'
import { createTmpDir, TmpDir, tmpZbayDirPath } from '../testUtils'
import { createPems } from './tests/client-server'


jest.setTimeout(120000)
describe('websocketOverTor connection test', () => {
  const upgradeOutbound = jest.fn()
  const upgradeInbound = jest.fn(x => x)
  const removeEventListener = jest.fn()
  const addEventListener = jest.fn()

  let tmpAppDataPath: string
  let tmpDir: TmpDir
  let service1: {
    onionAddress: string
    privateKey: string
  }
  let service2: {
    onionAddress: string
    privateKey: string
  }
  let tor: Tor

  beforeAll(async () => {
    jest.clearAllMocks()

    tmpDir = createTmpDir()
    tmpAppDataPath = tmpZbayDirPath(tmpDir.name)

    const ports = await getPorts()
    const torPath = utils.torBinForPlatform()
    const [controlPort] = await fp(9051)
    tor = new Tor({
      socksPort: ports.socksPort,
      torPath,
      appDataPath: tmpAppDataPath,
      controlPort: controlPort,
      options: {
        env: {
          LD_LIBRARY_PATH: utils.torDirForPlatform(),
          HOME: os.homedir()
        },
        detached: true
      }
    })
    await tor.init()

    service1 = await tor.createNewHiddenService(8080, 8080)
    service2 = await tor.createNewHiddenService(8081, 8081)
  })

  afterAll(async () => {
    await tor.kill()
    tmpDir.removeCallback()
  })

  it('websocketOverTor https connection', async () => {

    const pems = await createPems(`${service1.onionAddress}.onion`, `${service2.onionAddress}.onion`)



    const server = https.createServer({
      cert: pems.servCert,
      key: pems.servKey,
      ca: [pems.ca],
      requestCert: false,
      enableTrace: true,
    })

    const options = {
      server: server,
      verifyClient: () => true
    }

    const prepareListenerArg = {
      handler: (x) => x,
      upgrader: {
        upgradeOutbound,
        upgradeInbound
      }
    }

    const singal = {
      addEventListener,
      removeEventListener
    }

    const peerId1 = 'Qme5NiSQ6V3cc3nyfYVtkkXDPGBSYEVUNCN5sM4DbyYc7s'
    const peerId2 = 'QmeCWxba5Yk1ZAKogQJsaHXoAermE7PgFZqpqyKNg65cSN'

    const mockWebSocket = {
      agent: new SocksProxyAgent({ host: 'localhost', port: 9052 })
    }

    const websocketsOverTorData1 = {
      upgrader: {
        upgradeOutbound,
        upgradeInbound
      },
      websocket: {
        //...mockWebSocket,

      },
      localAddr: `/dns4/${service1.onionAddress}.onion/tcp/8080/wss/p2p/${peerId1}`
    }

    const websocketsOverTorData2 = {
      upgrader: {
        upgradeOutbound,
        upgradeInbound
      },
      websocket: {
        //...mockWebSocket,
        cert: pems.userCert,
        key: pems.userKey,
        ca: [pems.ca],
        rejectUnauthorized: false
      },
      localAddr: `/dns4/${service2.onionAddress}.onion/tcp/8081/wss/p2p/${peerId2}`
    }
    //const multiAddress = new Multiaddr(`/dns4/${service1.onionAddress}.onion/tcp/8080/wss/p2p/${peerId1}`)
    const multiAddress = new Multiaddr(`/dns4/localhost/tcp/8080/wss/p2p/${peerId1}`)

    const remoteAddress = new Multiaddr(`/dns4/${service2.onionAddress}.onion/tcp/8081/wss/p2p/${peerId2}`)

    const ws1 = new WebsocketsOverTor(websocketsOverTorData1)
    const ws2 = new WebsocketsOverTor(websocketsOverTorData2)

    const listen = await ws1.prepareListener(prepareListenerArg, options)

    await listen.listen(multiAddress)

    const onConnection = jest.fn()
    listen.on('connection', onConnection)

    await ws2.dial(multiAddress, {
      signal: singal
    })

    expect(onConnection).toBeCalled()
    expect(onConnection.mock.calls[0][0].remoteAddr).toEqual(remoteAddress)

  })


  // it('websocketOverTor invalid user cert', async () => {
  //   const pems = {
  //     ca: fs.readFileSync('testingFixtures/certificates/files/ca-certificate.pem'),
  //     ca_key: fs.readFileSync('testingFixtures/certificates/files/ca-key.pem'),
  //     servKey: fs.readFileSync('testingFixtures/certificates/files/key.pem'),
  //     servCert: fs.readFileSync('testingFixtures/certificates/files/certificate.pem'),
  //     userKey: fs.readFileSync('testingFixtures/certificates/files/client-key.pem'),
  //     userCert: fs.readFileSync('testingFixtures/certificates/files/client-certificate.pem')
  //   }

  //   const server = https.createServer({
  //     cert: pems.servCert,
  //     key: pems.servKey,
  //     ca: [pems.ca],
  //     requestCert: false
  //   })

  //   const options = {
  //     server: server,
  //     verifyClient: () => true
  //   }

  //   const prepareListenerArg = {
  //     handler: (x) => x,
  //     upgrader: {
  //       upgradeOutbound,
  //       upgradeInbound
  //     }
  //   }

  //   const singal = {
  //     addEventListener,
  //     removeEventListener
  //   }

  //   const peerId1 = 'Qme5NiSQ6V3cc3nyfYVtkkXDPGBSYEVUNCN5sM4DbyYc7s'
  //   const peerId2 = 'QmeCWxba5Yk1ZAKogQJsaHXoAermE7PgFZqpqyKNg65cSN'

  //   const mockWebSocket = {
  //     agent: new SocksProxyAgent({ host: 'localhost', port: 9052 })
  //   }

  //   const websocketsOverTorData1 = {
  //     upgrader: {
  //       upgradeOutbound,
  //       upgradeInbound
  //     },
  //     websocket: {
  //       ...mockWebSocket,
  //       cert: pems.servCert,
  //       key: pems.servKey,
  //       ca: [pems.ca]
  //     },
  //     localAddr: `/dns4/${service1.onionAddress}.onion/tcp/8080/wss/p2p/${peerId1}`
  //   }

  //   const websocketsOverTorData2 = {
  //     upgrader: {
  //       upgradeOutbound,
  //       upgradeInbound
  //     },
  //     websocket: {
  //       ...mockWebSocket,
  //       cert: pems.userCert,
  //       key: pems.userKey,
  //       ca: [pems.ca]
  //     },
  //     localAddr: `/dns4/${service2.onionAddress}.onion/tcp/8081/wss/p2p/${peerId2}`
  //   }
  //   const multiAddress = new Multiaddr(`/dns4/${service1.onionAddress}.onion/tcp/8080/wss/p2p/${peerId1}`)
  //   const remoteAddress = new Multiaddr(`/dns4/${service2.onionAddress}.onion/tcp/8081/wss/p2p/${peerId2}`)

  //   const ws1 = new WebsocketsOverTor(websocketsOverTorData1)
  //   const ws2 = new WebsocketsOverTor(websocketsOverTorData2)

  //   const listen = await ws1.prepareListener(prepareListenerArg, options)

  //   await listen.listen(multiAddress)

  //   const onConnection = jest.fn()
  //   listen.on('connection', onConnection)

  //   await ws2.dial(multiAddress, {
  //     signal: singal
  //   })

  //   expect(onConnection).toBeCalled()
  //   expect(onConnection.mock.calls[0][0].remoteAddr).toEqual(remoteAddress)

  //   await listen.close()
  // })
})
