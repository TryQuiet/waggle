import { Tor } from './torManager'
import { DataServer } from './socket/DataServer'
import { ConnectionsManager } from './libp2p/connectionsManager'
import initListeners from './socket/listeners/'
import { dataFromRootPems, ZBAY_DIR_PATH } from './constants'
import * as os from 'os'
import fs from 'fs'
import PeerId from 'peer-id'
import { getPorts, torBinForPlatform, torDirForPlatform } from './utils'

export class Node {
  tor: Tor
  torPath: string
  torAppDataPath: string
  pathDevLib: string
  hiddenServiceSecret: string | null
  peer: PeerId
  peerIdFileName: string | null
  port: number
  socksProxyPort: number
  torControlPort: number
  hiddenServicePort: number

  constructor(torPath?: string, pathDevLib?: string, peerIdFileName?: string, port = 7788, socksProxyPort = 9050, torControlPort = 9051, hiddenServicePort = 7788, torAppDataPath = ZBAY_DIR_PATH) {
    this.torPath = torPath || torBinForPlatform()
    this.torAppDataPath = torAppDataPath
    this.pathDevLib = pathDevLib || torDirForPlatform()
    this.peerIdFileName = peerIdFileName || this.getPeerIdFileName()
    let pport: number
    if (process.argv.length === 3) {
      console.log(process.argv)
      pport = Number(process.argv[2])
    } else {
      pport = port
    } 
    this.port = pport
    this.socksProxyPort = socksProxyPort
    this.torControlPort = torControlPort
    this.hiddenServicePort = hiddenServicePort
  }

  public getHiddenServiceSecret (): string {
    return process.env.HIDDEN_SERVICE_SECRET
  }

  public getPeerIdFileName (): string {
    console.log('PEERID_FILE', process.env.PEERID_FILE)
    return process.env.PEERID_FILE
  }

  async getStaticPeer(): Promise<PeerId> {
    console.log('Retrieving peer from file')
    const peerId = fs.readFileSync(this.peerIdFileName)
    const parsedId = JSON.parse(peerId.toString()) as PeerId.JSONPeerId
    return await PeerId.createFromJSON(parsedId)
  }

  async getPeer(): Promise<PeerId | null> {
    if (!this.peerIdFileName) {
      return null
    }
    return await this.getStaticPeer()
  }

  public async init(): Promise<void> {
    // this.tor = await this.spawnTor()
    // const onionAddress = await this.spawnService()
    // console.log('onion', onionAddress)
    const dataServer = await this.initDataServer()
    const connectonsManager = await this.initStorage(dataServer, '0.0.0.0')
    await this.initListeners(dataServer, connectonsManager)
    // await connectonsManager.setupRegistrationService(this.tor, process.env.HIDDEN_SERVICE_SECRET_REGISTRATION, dataFromRootPems)
  }

  async spawnTor (): Promise<Tor> {
    const tor = new Tor({
      torPath: this.torPath,
      appDataPath: this.torAppDataPath,
      controlPort: this.torControlPort,
      socksPort: this.socksProxyPort,
      options: {
        env: {
          LD_LIBRARY_PATH: this.pathDevLib,
          HOME: os.homedir()
        },
        detached: true
      }
    })
    await tor.init()
    return tor
  }

  async spawnService (): Promise<string> {
    console.log('Spawning service')
    let service: any
    try {
      service = this.tor.getServiceAddress(this.hiddenServicePort)
    } catch (e) {
      if (this.getHiddenServiceSecret()) {
        service = await (await this.tor.spawnHiddenService({
          virtPort: this.hiddenServicePort,
          targetPort: this.hiddenServicePort,
          privKey: this.getHiddenServiceSecret()
        }))
      } else {
        let hservice: any
        hservice = (await this.tor.createNewHiddenService(this.hiddenServicePort, this.hiddenServicePort))
        service = hservice.onionAddress
        console.log('PKEY', hservice.privateKey)
        console.log('ONION', hservice.onionAddress)
      }
    }
    return `${service}.onion`
  }

  async initDataServer(): Promise<DataServer> {
    console.log('Init DataServer')
    const ports = await getPorts()
    const dataServer = new DataServer(ports.dataServer)
    await dataServer.listen()
    return dataServer
  }

  async initStorage(dataServer: DataServer, host: string, storageClass?: any): Promise<ConnectionsManager> {
    console.log('initStorage.storageClass:->', storageClass)
    const peer = await this.getPeer()
    const connectonsManager = new ConnectionsManager({
      port: this.port,
      host: host,
      agentHost: 'localhost',
      agentPort: this.socksProxyPort,
      io: dataServer.io,
      storageClass,
      options: {
        bootstrapMultiaddrs: process.env.BOOTSTRAP_ADDRS ? [process.env.BOOTSTRAP_ADDRS] : [],
        isEntryNode: true
      }
    })
    const node = await connectonsManager.initializeNode(peer)
    console.log(node)
    await connectonsManager.initStorage()
    return connectonsManager
  }

  async initListeners(dataServer: DataServer, connectonsManager: ConnectionsManager) {
    initListeners(dataServer.io, connectonsManager)
  }
}

const main = async () => {
  const node = new Node()
  await node.init()
}

// main().catch(err => {
//   console.log(`Couldn't start entryNode: ${err as string}`)
// })
