import WebsocketsOverTor from './websocketOverTor'
import Multiaddr from 'multiaddr'
import { Tor } from '../torManager/index'
import os from 'os'
import fp from 'find-free-port'
import * as utils from '../utils'
// import SocksProxyAgent from './socksProxyAgent'
import HttpsProxyAgent from 'https-proxy-agent'
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
  let httpTunnelPort: number
  let port1: number
  let port2: number
  let listen

  beforeAll(async () => {
    jest.clearAllMocks()
    const [port1Arr] = await fp(8090)
    const [port2Arr] = await fp(port1Arr as number + 1)
    port1 = port1Arr
    port2 = port2Arr
    console.log(port1, port2)
    tmpDir = createTmpDir()
    tmpAppDataPath = tmpZbayDirPath(tmpDir.name)

    const torPath = utils.torBinForPlatform()
    const [controlPort] = await fp(9051)
    console.log(controlPort)
    httpTunnelPort = (await fp(controlPort as number + 1)).shift()
    const socksPort = (await fp(httpTunnelPort + 1)).shift()
    tor = new Tor({
      socksPort,
      torPath,
      appDataPath: tmpAppDataPath,
      controlPort,
      httpTunnelPort,
      options: {
        env: {
          LD_LIBRARY_PATH: utils.torDirForPlatform(),
          HOME: os.homedir()
        },
        detached: true
      }
    })
    await tor.init()

    service1 = await tor.createNewHiddenService(port1, port1)
    service2 = await tor.createNewHiddenService(port2, port2)
  })

  afterAll(async () => {
    await tor.kill()
    tmpDir.removeCallback()
  })

  afterEach(async () => {
    if (listen) {
      await listen.close()
    }
  })

  it('websocketOverTor https connection', async () => {
    const pems = await createPems(`${service1.onionAddress}.onion`, `${service2.onionAddress}.onion`)

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
      agent: HttpsProxyAgent({ host: 'localhost', port: httpTunnelPort })
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
        ca: [pems.ca]
      },
      localAddr: `/dns4/${service1.onionAddress}.onion/tcp/${port1}/wss/p2p/${peerId1}`
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
        ca: [pems.ca]
      },
      localAddr: `/dns4/${service2.onionAddress}.onion/tcp/${port2}/wss/p2p/${peerId2}`,
      serverOpts: {}
    }
    const multiAddress = new Multiaddr(`/dns4/${service1.onionAddress}.onion/tcp/${port1}/wss/p2p/${peerId1}`)

    const remoteAddress = new Multiaddr(`/dns4/${service2.onionAddress}.onion/tcp/${port2}/wss/p2p/${peerId2}`)

    const ws1 = new WebsocketsOverTor(websocketsOverTorData1)
    const ws2 = new WebsocketsOverTor(websocketsOverTorData2)

    listen = await ws1.prepareListener(prepareListenerArg)

    await listen.listen(multiAddress)

    const onConnection = jest.fn()
    listen.on('connection', onConnection)

    await ws2.dial(multiAddress, {
      signal: singal
    })

    expect(onConnection).toBeCalled()
    expect(onConnection.mock.calls[0][0].remoteAddr).toEqual(remoteAddress)
  })

  it('websocketOverTor invalid user cert', async () => {
    const pems = await createPems(`${service1.onionAddress}.onion`, `${service2.onionAddress}.onion`)
    const anotherPems = await createPems(`${service1.onionAddress}.onion`, `${service2.onionAddress}.onion`)

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
      agent: HttpsProxyAgent({ host: 'localhost', port: httpTunnelPort })
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
        ca: [pems.ca]
      },
      localAddr: `/dns4/${service1.onionAddress}.onion/tcp/${port1}/wss/p2p/${peerId1}`
    }

    const websocketsOverTorData2 = {
      upgrader: {
        upgradeOutbound,
        upgradeInbound
      },
      websocket: {
        ...mockWebSocket,
        cert: anotherPems.userCert,
        key: anotherPems.userKey,
        ca: [pems.ca]
      },
      localAddr: `/dns4/${service2.onionAddress}.onion/tcp/${port2}/wss/p2p/${peerId2}`,
      serverOpts: {}
    }
    const multiAddress = new Multiaddr(`/dns4/${service1.onionAddress}.onion/tcp/${port1}/wss/p2p/${peerId1}`)

    const ws1 = new WebsocketsOverTor(websocketsOverTorData1)
    const ws2 = new WebsocketsOverTor(websocketsOverTorData2)

    listen = await ws1.prepareListener(prepareListenerArg)

    await listen.listen(multiAddress)

    const onConnection = jest.fn()
    listen.on('connection', onConnection)

    await expect(ws2.dial(multiAddress, {
      signal: singal
    })).rejects.toBeTruthy()
  })

  it('websocketOverTor invalid server cert', async () => {
    const pems = await createPems(`${service1.onionAddress}.onion`, `${service2.onionAddress}.onion`)
    const anotherPems = await createPems(`${service1.onionAddress}.onion`, `${service2.onionAddress}.onion`)

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
      agent: HttpsProxyAgent({ host: 'localhost', port: httpTunnelPort })
    }

    const websocketsOverTorData1 = {
      upgrader: {
        upgradeOutbound,
        upgradeInbound
      },
      websocket: {
        ...mockWebSocket,
        cert: anotherPems.servCert,
        key: anotherPems.servKey,
        ca: [pems.ca]
      },
      localAddr: `/dns4/${service1.onionAddress}.onion/tcp/${port1}/wss/p2p/${peerId1}`
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
        ca: [pems.ca]
      },
      localAddr: `/dns4/${service2.onionAddress}.onion/tcp/${port2}/wss/p2p/${peerId2}`,
      serverOpts: {}
    }
    const multiAddress = new Multiaddr(`/dns4/${service1.onionAddress}.onion/tcp/${port1}/wss/p2p/${peerId1}`)

    const ws1 = new WebsocketsOverTor(websocketsOverTorData1)
    const ws2 = new WebsocketsOverTor(websocketsOverTorData2)

    listen = await ws1.prepareListener(prepareListenerArg)

    await listen.listen(multiAddress)

    const onConnection = jest.fn()
    listen.on('connection', onConnection)

    await expect(ws2.dial(multiAddress, {
      signal: singal
    })).rejects.toBeTruthy()
  })
})
