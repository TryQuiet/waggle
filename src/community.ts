import PeerId, { JSONPeerId } from 'peer-id'
import { ConnectionsManager } from './libp2p/connectionsManager'
import { Storage } from './storage'
import { getPorts } from './utils'
import debug from 'debug'
import { DataFromPems } from './common/types'
import { CertificateRegistration } from './registration'

const log = Object.assign(debug('waggle:communities'), {
  error: debug('waggle:communities:err')
})

interface HiddenServiceData {
  onionAddress: string
  privateKey?: string
  port?: number
}

interface CommunityData {
  hiddenService: HiddenServiceData
  peerId: JSONPeerId
  localAddress: string
}

class Community {
  id: string
  storage: Storage

  constructor(storage: Storage) {
    this.id = ''
    this.storage = storage
  }
}

export default class CommunitiesManager {
  connectionsManager: ConnectionsManager
  networks: Map<string, Storage>

  constructor(connectionsManager: ConnectionsManager) {
    this.connectionsManager = connectionsManager
    this.networks = new Map()
  }

  public getStorage(peerId: string): Storage {
    try {
      return this.networks.get(peerId)
    } catch (e) {
      log.error(`No available Storage for peer ${peerId}`)
      throw e
    }
  }

  public create = async (): Promise<CommunityData> => {
    const ports = await getPorts()
    const hiddenService = await this.connectionsManager.tor.createNewHiddenService(ports.libp2pHiddenService, ports.libp2pHiddenService)
    const peerId = await PeerId.create()
    const localAddress = await this.initStorage(peerId, hiddenService.onionAddress, ports.libp2pHiddenService, [(Math.random() + 1).toString(36)])
    log(`Created community, ${peerId.id}`)
    return {
      hiddenService,
      peerId: peerId.toJSON(),
      localAddress
    }
  }

  public launch = async (peerId: JSONPeerId, hiddenServiceKey: string, bootstrapMultiaddrs: string[]): Promise<string> => {
    // Start existing community (community that user is already a part of)
    const ports = await getPorts()
    const onionAddress = await this.connectionsManager.tor.spawnHiddenService({
      virtPort: ports.libp2pHiddenService,
      targetPort: ports.libp2pHiddenService,
      privKey: hiddenServiceKey
    })
    log(`Launching community, ${peerId.id}`)
    return await this.initStorage(await PeerId.createFromJSON(peerId), onionAddress, ports.libp2pHiddenService, bootstrapMultiaddrs)
  }

  public initStorage = async (peerId: PeerId, onionAddress: string, port: number, bootstrapMultiaddrs: string[]): Promise<string> => {
    const listenAddrs = `/dns4/${onionAddress}/tcp/${port}/ws`
    const libp2pObj = await this.connectionsManager._initLip2p(peerId, listenAddrs, bootstrapMultiaddrs)
    const storage = new this.connectionsManager.StorageCls(
      this.connectionsManager.zbayDir,
      this.connectionsManager.io,
      {
        ...this.connectionsManager.options,
        orbitDbDir: `OrbitDB${peerId.toB58String()}`,
        ipfsDir: `Ipfs${peerId.toB58String()}`
      }
    )
    await storage.init(libp2pObj.libp2p, peerId)
    this.networks.set(peerId.toB58String(), storage)
    return libp2pObj.localAddress
  }

  public setupRegistrationService = async (storage: Storage, dataFromPems: DataFromPems, hiddenServicePrivKey?: string, port?: number): Promise<CertificateRegistration> => {
    const certRegister = new CertificateRegistration(
      this.connectionsManager.tor, 
      storage, 
      dataFromPems, 
      hiddenServicePrivKey, 
      port
    )
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
}
