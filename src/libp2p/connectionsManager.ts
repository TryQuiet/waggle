import * as os from 'os'
import { SocksProxyAgent } from 'socks-proxy-agent'
import Mplex from 'libp2p-mplex'
import { NOISE } from 'libp2p-noise'
import fp from 'find-free-port'
import KademliaDHT from 'libp2p-kad-dht'
import Gossipsub from 'libp2p-gossipsub'
import PeerId, { JSONPeerId } from 'peer-id'
import WebsocketsOverTor from './websocketOverTor'
import Multiaddr from 'multiaddr'
import Bootstrap from 'libp2p-bootstrap'
import { Storage } from '../storage'
import { createPaths, getPorts, torBinForPlatform, torDirForPlatform } from '../utils'
import { Config, dataFromRootPems, ZBAY_DIR_PATH } from '../constants'
import fs from 'fs'
import path from 'path'
import { ConnectionsManagerOptions, DataFromPems, IChannelInfo, ILibp2pStatus, IMessage } from '../common/types'
import fetch, { Response } from 'node-fetch'
import debug from 'debug'
import CustomLibp2p, { Libp2pType } from './customLibp2p'
import { Tor } from '../torManager'
import { CertificateRegistration } from '../registration'
import { EventTypesResponse } from '../socket/constantsReponse'
import initListeners from '../socket/listeners'
import { createRootCA } from '@zbayapp/identity/lib'
import { Time } from 'pkijs'
import { RootCA } from '@zbayapp/identity/lib/generateRootCA'

const log = Object.assign(debug('waggle:conn'), {
  error: debug('waggle:conn:err')
})

interface HiddenServiceData {
  onionAddress: string
  privateKey?: string
  port?: number
}

interface CommunityData {
  onionAddress: string,
  registrar?: HiddenServiceData,
  peerId: JSONPeerId,
  localAddress: string,
  rootCA: RootCA
}

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
  libp2p: null | CustomLibp2p
  localAddress: string | null
  listenAddrs: string
  storage: Storage
  options: ConnectionsManagerOptions
  zbayDir: string
  io: SocketIO.Server
  peerId: PeerId | null
  bootstrapMultiaddrs: string[]
  libp2pTransportClass: any
  trackerApi: any
  networks: Map<string, Storage>
  StorageCls: any
  tor: Tor

  constructor({ host, port, agentHost, agentPort, options, storageClass, io }: IConstructor) {
    this.host = host
    this.port = port
    this.io = io
    this.agentPort = agentPort
    this.agentHost = agentHost
    this.socksProxyAgent = this.createAgent()
    this.localAddress = null
    this.options = {
      ...new ConnectionsManagerOptions(),
      ...options
    }
    this.zbayDir = this.options.env?.appDataPath || ZBAY_DIR_PATH
    this.StorageCls = storageClass || Storage
    this.storage = new this.StorageCls(this.zbayDir, this.io, { ...this.options })
    this.peerId = null
    this.bootstrapMultiaddrs = this.getBootstrapMultiaddrs()
    this.listenAddrs = `/dns4/${this.host}/tcp/${this.port}/ws`
    this.libp2pTransportClass = options.libp2pTransportClass || WebsocketsOverTor
    this.networks = new Map()
    
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

  private readonly getBootstrapMultiaddrs = () => {
    if (this.options.bootstrapMultiaddrs.length > 0) {
      return this.options.bootstrapMultiaddrs
    }
    return [
      '/dns4/2lmfmbj4ql56d55lmv7cdrhdlhls62xa4p6lzy6kymxuzjlny3vnwyqd.onion/tcp/7788/ws/p2p/Qmak8HeMad8X1HGBmz2QmHfiidvGnhu6w6ugMKtx8TFc85'
    ]
  }

  protected readonly getPeerId = async (): Promise<PeerId> => {
    let peerId
    const peerIdKeyPath = path.join(this.zbayDir, Config.PEER_ID_FILENAME)
    if (!fs.existsSync(peerIdKeyPath)) {
      if (this.options.createPaths) {
        createPaths([this.zbayDir])
      }
      peerId = await PeerId.create()
      fs.writeFileSync(peerIdKeyPath, peerId.toJSON().privKey)
    } else {
      const peerIdKey = fs.readFileSync(peerIdKeyPath, { encoding: 'utf8' })
      peerId = PeerId.createFromPrivKey(peerIdKey)
    }
    return peerId
  }

  public initializeNode = async (staticPeerId?: PeerId): Promise<ILibp2pStatus> => {
    initListeners(this.io, this)

    if (!staticPeerId) {
      this.peerId = await this.getPeerId()
    } else {
      this.peerId = staticPeerId
    }
    if (this.getBootstrapMultiaddrs().length === 0) {
      console.error('Libp2p needs bootstrap multiaddress!')
      return null
    }
    this.createAgent()
    this.localAddress = `${this.listenAddrs}/p2p/${this.peerId.toB58String()}`
    log('local address:', this.localAddress)
    log('bootstrapMultiaddrs:', this.bootstrapMultiaddrs)
    this.libp2p = await this.initLibp2p()
    return {
      address: this.localAddress,
      peerId: this.peerId.toB58String()
    }
  }

  // --------------- NEW API (COMMUNITIES)
  public init = async () => {
    initListeners(this.io, this)

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

  public createCommunity = async (name: string): Promise<CommunityData> => {
    // Create root CA
    const start = new Date()
    let end = new Date()
    end.setMonth(start.getMonth() + 1)
    const rootCA = await createRootCA(
      new Time({ type: 1, value: start }), 
      new Time({ type: 1, value: end }), 
      name
    )

    const ports = await getPorts()
    const hiddenServiceData = await this.tor.createNewHiddenService(ports.libp2pHiddenService, ports.libp2pHiddenService)    
    const peerId = await PeerId.create()
    const localAddress = await this.initNetwork(peerId, hiddenServiceData.onionAddress, ports.libp2pHiddenService, [(Math.random() + 1).toString(36)])

    // Create registrar since creator is the owner
    const registrar = await this.setupRegistrationService(this.tor, dataFromRootPems)
    return {
      onionAddress: hiddenServiceData.onionAddress,
      registrar: registrar.getHiddenServiceData(),
      peerId: peerId.toJSON(),
      localAddress,
      rootCA
    }
  }

  public launchCommunity = async (peerId: JSONPeerId, hiddenServiceKey: string, bootstrapMultiaddrs: string[], registrarData?: HiddenServiceData): Promise<string> => {
    // Start existing community (community that user is already a part of)
    const ports = await getPorts()
    const onionAddress = await this.tor.spawnHiddenService({
      virtPort: ports.libp2pHiddenService,
      targetPort: ports.libp2pHiddenService,
      privKey: hiddenServiceKey
    })
    
    const localAddress = await this.initNetwork(await PeerId.createFromJSON(peerId), onionAddress, ports.libp2pHiddenService, bootstrapMultiaddrs)

    if (registrarData) {
      await this.setupRegistrationService(this.tor, dataFromRootPems, registrarData.privateKey, registrarData.port)
    }

    return localAddress
  }

  protected initNetwork = async (peerId: PeerId, onionAddress: string, port: number, bootstrapMultiaddrs: string[]): Promise<string> => {
    const listenAddrs = `/dns4/${onionAddress}/tcp/${port}/ws`
    const libp2pObj = await this._initLip2p(peerId, listenAddrs, bootstrapMultiaddrs)
    const storage = new this.StorageCls(
      this.zbayDir, 
      this.io, 
      { 
        ...this.options, 
        orbitDbDir: `OrbitDB${peerId.toB58String()}`,
        ipfsDir: `Ipfs${peerId.toB58String()}`
      }
    )
    await storage.init(libp2pObj.libp2p, peerId)
    this.storage = storage  // At the moment only one community is supported
    return libp2pObj.localAddress
  }

  protected _initLip2p = async (peerId: PeerId, listenAddrs: string, bootstrapMultiaddrs: string[]) => {
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

  public stop = async () => {
    await this.stopLibp2p()
    await this.closeStorage()
    // Kill tor?
  }

  // ------------- endof new api

  public initLibp2p = async (): Promise<Libp2pType> => {
    const libp2p = ConnectionsManager.createBootstrapNode({
      peerId: this.peerId,
      listenAddrs: [this.listenAddrs],
      agent: this.socksProxyAgent,
      localAddr: this.localAddress,
      bootstrapMultiaddrsList: this.bootstrapMultiaddrs,
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
    return libp2p
  }

  public stopLibp2p = async () => {
    await this.libp2p.stop()
  }

  public subscribeForTopic = async (channelData: IChannelInfo) => {
    console.log('subscribeForTopic')
    await this.storage.subscribeForChannel(channelData.address, channelData)
  }

  public initStorage = async () => {
    await this.storage.init(this.libp2p, this.peerId)
  }

  public closeStorage = async () => {
    await this.storage.stopOrbitDb()
  }

  public updateChannels = async () => {
    await this.storage.updateChannels()
  }

  public askForMessages = async (channelAddress: string, ids: string[]) => {
    await this.storage.askForMessages(channelAddress, ids)
  }

  public loadAllMessages = async (channelAddress: string) => {
    this.storage.loadAllChannelMessages(channelAddress)
  }

  public saveCertificate = async (certificate: string) => {
    await this.storage.saveCertificate(certificate)
  }

  public connectToNetwork = async (target: string) => {
    log(`Attempting to dial ${target}`)
    await this.libp2p.dial(target, {
      localAddr: this.localAddress,
      remoteAddr: new Multiaddr(target)
    })
  }

  public sendPeerId = () => {
    const payload = this.peerId?.toB58String()
    this.io.emit(EventTypesResponse.SEND_PEER_ID, payload)
  }

  public sendMessage = async (
    channelAddress: string,
    messagePayload: IMessage
  ): Promise<void> => {
    const { id, type, signature, createdAt, message, pubKey } = messagePayload
    const messageToSend = {
      id,
      type,
      signature,
      createdAt,
      message,
      channelId: channelAddress,
      pubKey
    }
    await this.storage.sendMessage(channelAddress, messageToSend)
  }

  // DMs

  public addUser = async (
    publicKey: string,
    halfKey: string
  ): Promise<void> => {
    log(`CONNECTIONS MANAGER: addUser - publicKey ${publicKey} and halfKey ${halfKey}`)
    await this.storage.addUser(publicKey, halfKey)
  }

  public initializeConversation = async (
    address: string,
    encryptedPhrase: string
  ): Promise<void> => {
    log(`INSIDE WAGGLE: ${encryptedPhrase}`)
    await this.storage.initializeConversation(address, encryptedPhrase)
  }

  public getAvailableUsers = async (): Promise<void> => {
    await this.storage.getAvailableUsers()
  }

  public getPrivateConversations = async (): Promise<void> => {
    await this.storage.getPrivateConversations()
  }

  public sendDirectMessage = async (
    channelAddress: string,
    messagePayload: string
  ): Promise<void> => {
    await this.storage.sendDirectMessage(channelAddress, messagePayload)
  }

  public subscribeForDirectMessageThread = async (address): Promise<void> => {
    await this.storage.subscribeForDirectMessageThread(address)
  }

  public subscribeForAllConversations = async (conversations: string[]): Promise<void> => {
    await this.storage.subscribeForAllConversations(conversations)
  }

  public setupRegistrationService = async (tor: Tor, dataFromPems: DataFromPems, hiddenServicePrivKey?: string, port?: number): Promise<CertificateRegistration> => {
    const certRegister = new CertificateRegistration(tor, this, dataFromPems, hiddenServicePrivKey, port)
    try {
      await certRegister.init()
    } catch (err) {
      log.error(`Couldn't initialize certificate registration service: ${err as string}`)
      return
    }
    try {
      await certRegister.listen()
    } catch (err) {
      log.error(`Certificate registration service couldn't start listening: ${err as string}`)
    }
    return certRegister
  }

  public registerUserCertificate = async (serviceAddress: string, userCsr: string) => {
    const response = await this.sendCertificateRegistrationRequest(serviceAddress, userCsr)
    switch (response.status) {
      case 200:
        break
      case 403:
        this.emitCertificateRegistrationError('Username already taken.')
        return
      default:
        this.emitCertificateRegistrationError('Registering username failed.')
        return
    }
    const certificate: string = await response.json()
    this.io.emit(EventTypesResponse.SEND_USER_CERTIFICATE, certificate)
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

  public emitCertificateRegistrationError(message: string) {
    this.io.emit(EventTypesResponse.CERTIFICATE_REGISTRATION_ERROR, message)
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
