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

describe('websocketOverTor', () => {
  const upgradeOutbound = jest.fn()
  const upgradeInbound = jest.fn()
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
    const pems = {
      ca: fs.readFileSync('src/files/ca-certificate.pem'),
      ca_key: fs.readFileSync('src/files/ca-key.pem'),
      servKey: fs.readFileSync('src/files/key.pem'),
      servCert: fs.readFileSync('src/files/certificate.pem'),
      userKey: fs.readFileSync('src/files/client-key.pem'),
      userCert: fs.readFileSync('src/files/client-certificate.pem')
    }

    const server = https.createServer({
      cert: pems.servCert,
      key: pems.servKey,
      ca: [pems.ca],
      requestCert: false
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
        ...mockWebSocket,
        cert: pems.servCert,
        key: pems.servKey,
        ca: [pems.ca],
        rejectUnauthorized: false
      },
      localAddr: `/dns4/${service1.onionAddress}.onion/tcp/8080/wss/p2p/${peerId1}`
    }

    const websocketsOverTorData2 = {
      upgrader: {
        upgradeOutbound,
        upgradeInbound
      },
      websocket: {
        ...mockWebSocket,
        cert: pems.userCert,
        key: pems.userKey,
        ca: [pems.ca],
        rejectUnauthorized: false
      },
      localAddr: `/dns4/${service2.onionAddress}.onion/tcp/8081/wss/p2p/${peerId2}`
    }
    const multiAddress = new Multiaddr(`/dns4/${service1.onionAddress}.onion/tcp/8080/wss/p2p/${peerId1}`)

    const ws1 = new WebsocketsOverTor(websocketsOverTorData1)
    const ws2 = new WebsocketsOverTor(websocketsOverTorData2)

    const listen = await ws1.prepareListener(prepareListenerArg, { options })

    await listen.listen(multiAddress)

    await ws2.dial(multiAddress, {
      signal: singal
    })

    await listen.close()
  })
})
