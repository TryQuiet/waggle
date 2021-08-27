import WebsocketsOverTor from './websocketOverTor'
import connect from 'it-ws/client'
import Multiaddr from 'multiaddr'
import toConnection from 'libp2p-websockets/src/socket-to-conn'
import { createServer } from 'it-ws'
import url, { Url, UrlWithStringQuery } from 'url'
import { getPorts } from '../utils'
import { Tor } from '../torManager/index'
import os from 'os'
import fs from 'fs'
import fp from 'find-free-port'
import * as utils from '../utils'
import https from 'https'
import { SocksProxyAgent } from 'socks-proxy-agent'

jest.mock('libp2p-websockets/src/socket-to-conn')
jest.mock('url')
// jest.mock('multiaddr-to-uri')
jest.setTimeout(30000000)

const rawMockSocket = {
  connected: () => 'connected',
  close: () => 'close'
}

const maConn = {
  remoteAddr: () => 'remoteAddr',
  close: jest.fn()
}

const server = {
  on: function () { return this },
  close: () => 'close',
  address: () => 'address',
  listen: () => 'listen',
  connections: () => 'connections'
}

const rl2return = {
  query: {
    remoteAddress: '/dns4/dyevuqukcuvembemzzwhanpdbrksdenuggwgxvqppr2bunegna6k6yid.onion/tcp/7950/ws/p2p/QmTmh8cqtyAv6LSFnS7L6at8uSiCX9knNEEj6saz41vQKD'
  }
}

// eslint-disable-next-line
const urlParse = url.parse as jest.Mock<UrlWithStringQuery & Url>

describe('websocketOverTor', () => {
  const mockLocalAddress = 'localAddressTest'
  const mockWebSocket = {
    agent: new SocksProxyAgent({ host: 'localhost', port: 9052 })
  }
  const upgradeOutbound = jest.fn()
  const upgradeInbound = jest.fn()
  const removeEventListener = jest.fn()
  const addEventListener = jest.fn()
  const websocketsOverTorData = {
    upgrader: {
      upgradeOutbound,
      upgradeInbound
    },
    websocket: mockWebSocket,
    localAddr: mockLocalAddress
  }

  let tmpAppDataPath: string

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('dial success', async () => {
    connect.mockImplementation(() => rawMockSocket)
    toConnection.mockImplementation(() => maConn)

    const cos = new WebsocketsOverTor(websocketsOverTorData)
    const multiAddress = new Multiaddr('/dns4/dyevuqukcuvembemzzwhanpdbrksdenuggwgxvqppr2bunegna6k6yid.onion/tcp/7950/ws/p2p/QmTmh8cqtyAv6LSFnS7L6at8uSiCX9knNEEj6saz41vQKD')
    const singal = {
      addEventListener,
      removeEventListener
    }

    await cos.dial(multiAddress, {
      signal: singal
    })

    const expectedUri = `ws://dyevuqukcuvembemzzwhanpdbrksdenuggwgxvqppr2bunegna6k6yid.onion:7950/p2p/QmTmh8cqtyAv6LSFnS7L6at8uSiCX9knNEEj6saz41vQKD/?remoteAddress=${mockLocalAddress}`
    const expectedOptionsConnect = {
      binary: true,
      localAddr: mockLocalAddress,
      websocket: mockWebSocket,
      signal: singal
    }

    const expectedOptionsToConnection = {
      remoteAddr: multiAddress,
      signal: singal
    }

    expect(connect).toBeCalledWith(expectedUri, expectedOptionsConnect)

    expect(toConnection).toBeCalledWith(rawMockSocket, expectedOptionsToConnection)

    expect(upgradeOutbound).toBeCalledWith(maConn)

    expect(addEventListener).toBeCalledWith('abort', expect.anything())

    expect(removeEventListener).toBeCalledWith('abort', expect.anything())
  })

  it('dial failed toConnection', async () => {
    connect.mockImplementation(() => rawMockSocket)
    toConnection.mockImplementation(() => { throw new Error('toConnect failed') })

    const cos = new WebsocketsOverTor(websocketsOverTorData)
    const multiAddress = new Multiaddr('/dns4/dyevuqukcuvembemzzwhanpdbrksdenuggwgxvqppr2bunegna6k6yid.onion/tcp/7950/ws/p2p/QmTmh8cqtyAv6LSFnS7L6at8uSiCX9knNEEj6saz41vQKD')

    await expect(async () => {
      await cos.dial(multiAddress, {})
    })
      .rejects
      .toThrow('toConnect failed')
  })

  it('dial failed upgradeOutbound', async () => {
    connect.mockImplementation(() => rawMockSocket)
    toConnection.mockImplementation(() => maConn)

    const newWebsocketsOverTorData = {
      ...websocketsOverTorData,
      upgrader: {
        upgradeOutbound: () => {
          throw new Error('upgradeOutbound failed')
        }
      }
    }

    const cos = new WebsocketsOverTor(newWebsocketsOverTorData)
    const multiAddress = new Multiaddr('/dns4/dyevuqukcuvembemzzwhanpdbrksdenuggwgxvqppr2bunegna6k6yid.onion/tcp/7950/ws/p2p/QmTmh8cqtyAv6LSFnS7L6at8uSiCX9knNEEj6saz41vQKD')

    await expect(async () => {
      await cos.dial(multiAddress, {})
    })
      .rejects
      .toThrow('upgradeOutbound failed')
  })

  it('prepareListener success', async () => {
    const request = {
      url: ''
    }

    urlParse.mockImplementation(() => rl2return as any)
    // eslint-disable-next-line
    createServer.mockImplementation((a, b) => {
      b({}, request)
      return server
    })
    toConnection.mockImplementation(() => maConn)

    const cos = new WebsocketsOverTor(websocketsOverTorData)

    const prepareListenerArg = {
      handler: {},
      upgrader: {
        upgradeOutbound,
        upgradeInbound
      }
    }

    const options = {
      option: 'option'
    }

    cos.prepareListener(prepareListenerArg, options)

    expect(createServer).toBeCalledWith(options, expect.anything())
    expect(toConnection).toBeCalledWith({}, { remoteAddr: new Multiaddr(rl2return.query.remoteAddress) })
  })

  it('prepareListener failed', async () => {
    const request = {
      url: ''
    }

    urlParse.mockImplementation(() => rl2return as any)
    // eslint-disable-next-line
    createServer.mockImplementation((a, b) => {
      b({}, request)
      return server
    })
    connect.mockImplementation(() => rawMockSocket)
    toConnection.mockImplementation(() => maConn)

    const cos = new WebsocketsOverTor(websocketsOverTorData)
    const prepareListenerArg = {
      handler: {},
      upgrader: {
        upgradeOutbound,
        upgradeInbound: () => { throw new Error('toConnect failed') }
      }
    }

    const options = {
      option: 'option'
    }
    cos.prepareListener(prepareListenerArg, options)

    expect(maConn.close).toHaveBeenCalled()
  })

  it.only('prepareListener failed', async () => {
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
      handler: {},
      upgrader: {
        upgradeOutbound,
        upgradeInbound
      }
    }

    const singal = {
      addEventListener,
      removeEventListener
    }

    // ------------- TOR

    const ports = await getPorts()
    const torPath = utils.torBinForPlatform()
    const [controlPort] = await fp(9051)
    const tor = new Tor({
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

    const service1 = await tor.createNewHiddenService(9799, 9799)
    const service2 = await tor.createNewHiddenService(9799, 9799)

    const peerId1 = 'Qme5NiSQ6V3cc3nyfYVtkkXDPGBSYEVUNCN5sM4DbyYc7s'
    const peerId2 = 'QmeCWxba5Yk1ZAKogQJsaHXoAermE7PgFZqpqyKNg65cSN'

    const websocketsOverTorData1 = {
      upgrader: {
        upgradeOutbound,
        upgradeInbound
      },
      websocket: mockWebSocket,
      localAddr: `/dns4/${service1.onionAddress}.onion/tcp/7788/wss/p2p/${peerId1}`
    }

    const websocketsOverTorData2 = {
      upgrader: {
        upgradeOutbound,
        upgradeInbound
      },
      websocket: mockWebSocket,
      localAddr: `/dns4/${service2.onionAddress}.onion/tcp/7788/wss/p2p/${peerId2}`
    }
    const multiAddress = new Multiaddr(`/dns4/${service1.onionAddress}.onion/tcp/7788/wss/p2p/${peerId1}`)

    const ws1 = new WebsocketsOverTor(websocketsOverTorData1)
    const ws2 = new WebsocketsOverTor(websocketsOverTorData2)

    await ws1.prepareListener(prepareListenerArg, { options })

    await ws2.dial(multiAddress, {
      signal: singal,
      websocket: {
        cert: pems.userCert,
        key: pems.userKey,
        ca: [pems.ca],
        rejectUnauthorized: false
      }
    })
  })
})
