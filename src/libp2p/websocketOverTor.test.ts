import WebsocketsOverTor from './websocketOverTor'
import connect from 'it-ws/client'
import Multiaddr from 'multiaddr'
import toConnection from 'libp2p-websockets/src/socket-to-conn'
import { createServer } from 'it-ws'
import url, { Url, UrlWithStringQuery } from 'url'

jest.mock('it-ws/client')
jest.mock('libp2p-websockets/src/socket-to-conn')
jest.mock('it-ws')
jest.mock('url')

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
  const mockWebSocket = {}
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
})
