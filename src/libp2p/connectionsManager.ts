import Libp2p from 'libp2p'
import { SocksProxyAgent } from 'socks-proxy-agent'
import Mplex from 'libp2p-mplex'
import { NOISE } from 'libp2p-noise'
import KademliaDHT from 'libp2p-kad-dht'
import Gossipsub from 'libp2p-gossipsub'
import PeerId from 'peer-id'
import WebsocketsOverTor from './websocketOverTor'
import Multiaddr from 'multiaddr'
import Bootstrap from 'libp2p-bootstrap'
import multihashing from 'multihashing-async'
import { Storage } from '../storage'
import { createPaths, fetchAbsolute } from '../utils'
import { ZBAY_DIR_PATH } from '../constants'
import fs from 'fs'
import path from 'path'
import { IChannelInfo } from '../storage/storage'
import fetch from 'node-fetch';


interface IOptions {
  env: {
    appDataPath: string
  }
}
interface IConstructor {
  host: string
  port: number
  agentPort: number
  agentHost: string
  options?: {
    env: {
      appDataPath: string
    }
  }
  io: any
}
interface IBasicMessage {
  id: string
  type: number
  signature: string
  createdAt: number
  r: number
  message: string
  typeIndicator: number
}

interface ILibp2pStatus {
  address: string
  peerId: string
}

export class ConnectionsManager {
  host: string
  port: number
  agentHost: string
  agentPort: number
  socksProxyAgent: any
  libp2p: null | Libp2p
  localAddress: string | null
  storage: Storage
  options: IOptions
  zbayDir: string
  io: any
  peerId: PeerId
  trackerApi: any

  constructor({ host, port, agentHost, agentPort, options, io }: IConstructor) {
    this.host = host
    this.port = port
    this.io = io
    this.agentPort = agentPort
    this.agentHost = agentHost
    this.localAddress = null
    this.options = options
    this.zbayDir = options?.env.appDataPath || ZBAY_DIR_PATH
    this.storage = new Storage(this.zbayDir, this.io)
    this.peerId = null
    this.trackerApi = fetchAbsolute(fetch)('http://okmlac2qjgo2577dkyhpisceua2phwxhdybw4pssortdop6ddycntsyd.onion:7788')

    process.on('unhandledRejection', error => {
      console.error(error)
      throw error
    })
    process.on('SIGINT', function() {
      console.log('\nGracefully shutting down from SIGINT (Ctrl-C)')
      process.exit(0)
    })
  }

  private createAgent = () => {
    this.socksProxyAgent = new SocksProxyAgent({ port: this.agentPort, host: this.agentHost })
  }

  private getPeerId = async (): Promise<PeerId> => {
    let peerId
    const peerIdKeyPath = path.join(this.zbayDir, 'peerIdKey')
    if (!fs.existsSync(peerIdKeyPath)) {
      createPaths([this.zbayDir])
      peerId = await PeerId.create()
      fs.writeFileSync(peerIdKeyPath, peerId.toJSON().privKey)
    } else {
      const peerIdKey = fs.readFileSync(peerIdKeyPath, {encoding: 'utf8'})
      peerId = PeerId.createFromPrivKey(peerIdKey)
    }
    return peerId
  }

  private getInitialPeers = async (): Promise<Array<string>> => {
    const options = {
      method: 'GET',
      agent: () => {
        return this.socksProxyAgent;
      }
    };
    const response = await this.trackerApi('/peers', options)
    return response.json()
  }
  
  private registerPeer = async (address: string): Promise<void> => {
    const options = {
      method: 'POST',
      body: JSON.stringify({'address': address}),
      headers: {'Content-Type': 'application/json'},
      agent: () => {
        return this.socksProxyAgent;
      }
    };
    await this.trackerApi('/register', options)
  }

  public initializeNode = async (staticPeerId?: PeerId): Promise<ILibp2pStatus> => {
    if (!staticPeerId) {
      this.peerId = await this.getPeerId()
    } else {
      this.peerId = staticPeerId
    }
    this.createAgent()

    const listenAddrs = [`/dns4/${this.host}/tcp/${this.port}/ws`]
    this.localAddress = `${listenAddrs}/p2p/${this.peerId.toB58String()}`
    console.log('local address:', this.localAddress)

    try {
      await this.registerPeer(this.localAddress)
    } catch (e) {
      console.error('Couldn\'t register peer. Probably tracker is offline. Error:', e)
      return
    }
    const bootstrapMultiaddrs = await this.getInitialPeers()
    console.log('bootstrapMultiaddrs:', bootstrapMultiaddrs)

    this.libp2p = await this.createBootstrapNode({
      peerId: this.peerId,
      listenAddrs,
      agent: this.socksProxyAgent,
      localAddr: this.localAddress,
      bootstrapMultiaddrsList: bootstrapMultiaddrs
    })
    this.libp2p.connectionManager.on('peer:connect', async connection => {
      console.log('Connected to', connection.remotePeer.toB58String())
    })
    this.libp2p.connectionManager.on('peer:discovery', peer => {
      console.log(peer, 'peer discovery')
    })
    this.libp2p.connectionManager.on('peer:disconnect', connection => {
      console.log('Disconnected from', connection.remotePeer.toB58String())
    })
    
    return {
      address: this.localAddress,
      peerId: this.peerId.toB58String()
    }
  }
  
  public subscribeForTopic = async (channelData: IChannelInfo) => {
    await this.storage.subscribeForChannel(channelData.address, channelData)
  }
  
  public initStorage = async () => {
    await this.storage.init(this.libp2p, this.peerId)
  }

  public updateChannels = async () => {
    await this.storage.updateChannels()
  }

  public loadAllMessages = (channelAddress: string) => {
    this.storage.loadAllChannelMessages(channelAddress)
  }

  public connectToNetwork = async (target: string) => {
    console.log(`Attempting to dial ${target}`)
    await this.libp2p.dial(target, {
      localAddr: this.localAddress,
      remoteAddr: new Multiaddr(target)
    })
  }

  public createOnionPeerId = async (peerId: string) => {
    const key = new TextEncoder().encode(`onion${peerId.substring(0, 10)}`)
    const digest = await multihashing(key, 'sha2-256')
    return digest
  }

  public sendMessage = async (
    channelAddress: string,
    messagePayload: IBasicMessage
  ): Promise<void> => {
    const { id, type, signature, r, createdAt, message, typeIndicator } = messagePayload
    const messageToSend = {
      id,
      type,
      signature,
      createdAt,
      r,
      message,
      typeIndicator,
      channelId: channelAddress
    }
    await this.storage.sendMessage(channelAddress, messageToSend)
  }

  public initializeData = async () => {
    await this.storage.loadInitChannels()
  }

  private createBootstrapNode = ({
    peerId,
    listenAddrs,
    agent,
    localAddr,
    bootstrapMultiaddrsList
  }): Promise<Libp2p> => {
    return Libp2p.create({
      peerId,
      addresses: {
        listen: listenAddrs
      },
      modules: {
        transport: [WebsocketsOverTor],
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
          }
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
          WebsocketsOverTor: {
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
