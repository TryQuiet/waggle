import * as os from 'os'
import { SocksProxyAgent } from 'socks-proxy-agent'
import Mplex from 'libp2p-mplex'
import { NOISE } from 'libp2p-noise'
import KademliaDHT from 'libp2p-kad-dht'
import Gossipsub from 'libp2p-gossipsub'
import PeerId from 'peer-id'
import WebsocketsOverTor from './websocketOverTor'
import Bootstrap from 'libp2p-bootstrap'
import { Storage } from '../storage'
import { getPorts, torBinForPlatform, torDirForPlatform } from '../utils'
import { ZBAY_DIR_PATH } from '../constants'
import path from 'path'
import { ConnectionsManagerOptions } from '../common/types'
import fetch, { Response } from 'node-fetch'
import debug from 'debug'
import CustomLibp2p, { Libp2pType } from './customLibp2p'
import { Tor } from '../torManager'
import initListeners from '../socket/listeners'
import IOProxy from '../IOHandler'

const log = Object.assign(debug('waggle:conn'), {
  error: debug('waggle:conn:err')
})

export interface IConstructor {
  host?: string
  port?: number
  agentPort?: number
  agentHost?: string
  options?: Partial<ConnectionsManagerOptions>
  io: any
  storageClass?: any // TODO: what type?
}

export class ConnectionsManager {
  host: string
  port: number
  agentHost: string
  agentPort: number
  socksProxyAgent: any
  options: ConnectionsManagerOptions
  zbayDir: string
  io: SocketIO.Server
  libp2pTransportClass: any
  StorageCls: any
  tor: Tor

  constructor({ host, port, agentHost, agentPort, options, storageClass, io }: IConstructor) {
    this.host = host
    this.port = port
    this.io = io
    this.agentPort = agentPort
    this.agentHost = agentHost
    this.socksProxyAgent = this.createAgent()
    this.options = {
      ...new ConnectionsManagerOptions(),
      ...options
    }
    this.zbayDir = this.options.env?.appDataPath || ZBAY_DIR_PATH
    this.StorageCls = storageClass || Storage
    this.libp2pTransportClass = options.libp2pTransportClass || WebsocketsOverTor

    process.on('unhandledRejection', error => {
      console.error(error)
      throw new Error()
    })
    process.on('SIGINT', function () {
      log('\nGracefully shutting down from SIGINT (Ctrl-C)')
      process.exit(0)
    })
  }

  public readonly createAgent = () => {
    if (this.socksProxyAgent || !this.agentPort || !this.agentHost) return

    log('Creating socks proxy agent')
    return new SocksProxyAgent({ port: this.agentPort, host: this.agentHost })
  }

  public init = async () => {
    initListeners(this.io, new IOProxy(this))

    const ports = await getPorts()
    this.tor = new Tor({
      torPath: torBinForPlatform(),
      appDataPath: path.join.apply(null, [ZBAY_DIR_PATH, 'Zbay']),
      controlPort: this.options.torControlPort || ports.controlPort,
      socksPort: this.agentPort,
      torPassword: this.options.torPassword,
      options: {
        env: {
          LD_LIBRARY_PATH: torDirForPlatform(),
          HOME: os.homedir()
        },
        detached: true
      }
    })

    if (this.options.spawnTor) {
      await this.tor.init()
    } else {
      this.tor.initTorControl()
    }
  }

  public _initLip2p = async (peerId: PeerId, listenAddrs: string, bootstrapMultiaddrs: string[]) => {
    const localAddress = `${listenAddrs}/p2p/${peerId.toB58String()}`
    const libp2p = ConnectionsManager.createBootstrapNode({
      peerId: peerId,
      listenAddrs: [listenAddrs],
      agent: this.socksProxyAgent,
      localAddr: localAddress,
      bootstrapMultiaddrsList: bootstrapMultiaddrs,
      transportClass: this.libp2pTransportClass
    })
    libp2p.connectionManager.on('peer:connect', async connection => {
      log('Connected to', connection.remotePeer.toB58String())
    })
    libp2p.on('peer:discovery', (peer: PeerId) => {
      log(`Discovered ${peer.toB58String()}`)
    })
    libp2p.connectionManager.on('peer:disconnect', connection => {
      log('Disconnected from', connection.remotePeer.toB58String())
    })
    return {
      libp2p,
      localAddress
    }
  }

  public sendCertificateRegistrationRequest = async (serviceAddress: string, userCsr: string): Promise<Response> => {
    const options = {
      method: 'POST',
      body: JSON.stringify({ data: userCsr }),
      headers: { 'Content-Type': 'application/json' },
      agent: new SocksProxyAgent({ port: this.agentPort, host: this.agentHost })
    }
    try {
      return await fetch(serviceAddress + '/register', options)
    } catch (e) {
      console.error(e)
      throw e
    }
  }

  public static readonly createBootstrapNode = ({
    peerId,
    listenAddrs,
    agent,
    localAddr,
    bootstrapMultiaddrsList,
    transportClass
  }): Libp2pType => {
    return ConnectionsManager.defaultLibp2pNode({
      peerId,
      listenAddrs,
      agent,
      localAddr,
      bootstrapMultiaddrsList,
      transportClass
    })
  }

  private static readonly defaultLibp2pNode = ({
    peerId,
    listenAddrs,
    agent,
    localAddr,
    bootstrapMultiaddrsList,
    transportClass
  }): Libp2pType => {
    return new CustomLibp2p({
      peerId,
      addresses: {
        listen: listenAddrs
      },
      modules: {
        transport: [transportClass],
        peerDiscovery: [Bootstrap],
        streamMuxer: [Mplex],
        connEncryption: [NOISE],
        dht: KademliaDHT,
        pubsub: Gossipsub
      },
      config: {
        peerDiscovery: {
          [Bootstrap.tag]: {
            enabled: true,
            list: bootstrapMultiaddrsList // provide array of multiaddrs
          },
          autoDial: true
        },
        relay: {
          enabled: true,
          hop: {
            enabled: true,
            active: false
          }
        },
        dht: {
          enabled: true,
          randomWalk: {
            enabled: true
          }
        },
        transport: {
          [transportClass.name]: {
            websocket: {
              agent
            },
            localAddr
          }
        }
      }
    })
  }
}
