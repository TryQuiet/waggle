import WebsocketsOverTor from './websocketOverTor'
import Multiaddr from 'multiaddr'
import { Tor } from '../torManager/index'
import os from 'os'
import fp from 'find-free-port'
import * as utils from '../utils'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { createTmpDir, TmpDir, tmpZbayDirPath } from '../testUtils'
import { createCertificatesTestHelper } from './tests/client-server'

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
  let listener

  beforeAll(async () => {
    jest.clearAllMocks()
    const [port1Arr] = await fp(8090)
    const [port2Arr] = await fp(port1Arr as number + 1)
    port1 = port1Arr
    port2 = port2Arr
    tmpDir = createTmpDir()
    tmpAppDataPath = tmpZbayDirPath(tmpDir.name)

    const torPath = utils.torBinForPlatform()
    const [controlPort] = await fp(9051)
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
    if (listener) {
      await listener.close()
    }
  })

  it('websocketOverTor https connection', async () => {
    const pems = await createCertificatesTestHelper(`${service1.onionAddress}.onion`, `${service2.onionAddress}.onion`)

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

    const agent = new HttpsProxyAgent({ host: 'localhost', port: httpTunnelPort })

    console.log(pems.servCert, 'SERVCERT--------------------------------------------------------')
    console.log(pems.servKey, 'SERVKEY--------------------------------------------------------')
    console.log(pems.ca, 'CA--------------------------------------------------------')

    const websocketsOverTorData1 = {
      upgrader: {
        upgradeOutbound,
        upgradeInbound
      },
      websocket: {
        agent,
        cert: "MIICCDCCAa4CBgF8AzS4GzAKBggqhkjOPQQDAjASMRAwDgYDVQQDEwdaYmF5IENBMB4XDTEwMTIyODEwMTAxMFoXDTMwMTIyODEwMTAxMFowQzFBMD8GA1UEAxM4dXJlZmt6Z3Y2dmJ4Z2Eyd2xpcWV4cHgzaGtsNnNoaWd3cmM1YzNhc2x1Y2FleG9reHRxYXJ0aWQwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAAT4AiU8WG8m5xaWueuNxNv30VVflyRofCxqCFWf0b2F9Zk1+07IdYe5svTnpqfJrOj/4/dXVGiSF6TTK5mawR3co4HDMIHAMAkGA1UdEwQCMAAwCwYDVR0PBAQDAgAOMB0GA1UdJQQWMBQGCCsGAQUFBwMCBggrBgEFBQcDATAvBgkqhkiG9w0BCQwEIgQgZhSBXIdYptJZz5cw+Dgdf4w4F3/wNm6RFhb1m6YcfcYwFwYKKwYBBAGDjBsCAQQJEwdkZmdkZmdnMD0GCSsGAQIBDwMBAQQwEy5RbVZjVVg0bTJ4S3ZKMmdmdm8xeExCZWhqZWhORkVVandtRXlHQnR6QjFodmhvMAoGCCqGSM49BAMCA0gAMEUCIQDgUvF9GSw+YxgrCsGXGV1XSiZxmS8FlwogPXTtX7PgRQIgWnOjVSNOOdjc6QaUNY1IC29GafiihVfoa3bgwIBoBME=",
        key: "MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQglJny0bgJqPrOMiDScy6Knr321puSTns0h8GBqcF+pCmgCgYIKoZIzj0DAQehRANCAAT4AiU8WG8m5xaWueuNxNv30VVflyRofCxqCFWf0b2F9Zk1+07IdYe5svTnpqfJrOj/4/dXVGiSF6TTK5mawR3c",
        ca: ["MIIBTDCB8wIBATAKBggqhkjOPQQDAjASMRAwDgYDVQQDEwdaYmF5IENBMB4XDTEwMTIyODEwMTAxMFoXDTMwMTIyODEwMTAxMFowEjEQMA4GA1UEAxMHWmJheSBDQTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABBXWSIohpi9d7MA6DuhSmmAn5yDNQGf42MMfdc63+c6yezguTXAs2RaDI0a1OIj1vt/g/4giGBgthetHk56qO4+jPzA9MA8GA1UdEwQIMAYBAf8CAQMwCwYDVR0PBAQDAgAGMB0GA1UdJQQWMBQGCCsGAQUFBwMCBggrBgEFBQcDATAKBggqhkjOPQQDAgNIADBFAiA7RhS5j+7U/91hh5junysPzYuXHxpI34ZszAZcspoU6QIhANQPsS2WTFNsbb+lQBhMnjTnmSc7auXMPHFnyYMbU9wi"]
      },
      localAddr: `/dns4/tgznht7pq4vcslcffrgl7rzueunlcc7wy4ic5ws6qodi24rytlpwheqd.onion/tcp/${port1}/wss/p2p/QmXDT3nJeZQRTaDX8VCTNHX9azLkpzvYN8Q7s6sRCEcyZd`
    }

    const websocketsOverTorData2 = {
      upgrader: {
        upgradeOutbound,
        upgradeInbound
      },
      websocket: {
        agent,
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

    listener = await ws1.prepareListener(prepareListenerArg)

    await listener.listen(multiAddress)

    // const onConnection = jest.fn()
    // listener.on('connection', onConnection)

    // await ws2.dial(multiAddress, {
    //   signal: singal
    // })

    // expect(onConnection).toBeCalled()
    // expect(onConnection.mock.calls[0][0].remoteAddr).toEqual(remoteAddress)
  })

  it.skip('websocketOverTor invalid user cert', async () => {
    const pems = await createCertificatesTestHelper(`${service1.onionAddress}.onion`, `${service2.onionAddress}.onion`)
    const anotherPems = await createCertificatesTestHelper(`${service1.onionAddress}.onion`, `${service2.onionAddress}.onion`)

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

    const agent = new HttpsProxyAgent({ host: 'localhost', port: httpTunnelPort })

    const websocketsOverTorData1 = {
      upgrader: {
        upgradeOutbound,
        upgradeInbound
      },
      websocket: {
        agent,
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
        agent,
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

    listener = await ws1.prepareListener(prepareListenerArg)

    await listener.listen(multiAddress)

    const onConnection = jest.fn()
    listener.on('connection', onConnection)

    await expect(ws2.dial(multiAddress, {
      signal: singal
    })).rejects.toBeTruthy()
  })

  it.skip('websocketOverTor invalid server cert', async () => {
    const pems = await createCertificatesTestHelper(`${service1.onionAddress}.onion`, `${service2.onionAddress}.onion`)
    const anotherPems = await createCertificatesTestHelper(`${service1.onionAddress}.onion`, `${service2.onionAddress}.onion`)

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

    const agent = new HttpsProxyAgent({ host: 'localhost', port: httpTunnelPort })

    const websocketsOverTorData1 = {
      upgrader: {
        upgradeOutbound,
        upgradeInbound
      },
      websocket: {
        agent,
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
        agent,
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

    listener = await ws1.prepareListener(prepareListenerArg)

    await listener.listen(multiAddress)

    const onConnection = jest.fn()
    listener.on('connection', onConnection)

    await expect(ws2.dial(multiAddress, {
      signal: singal
    })).rejects.toBeTruthy()
  })
})
