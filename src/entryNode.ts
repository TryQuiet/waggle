import { Tor } from './torManager'
import { Storage } from './storage'
import { DataServer } from './socket/DataServer'
import { ConnectionsManager } from './libp2p/connectionsManager'
import initListeners from './socket/listeners/'
import { ZBAY_DIR_PATH } from './constants'
import * as path from 'path'
import * as os from 'os'
import fs from 'fs'
import PeerId from 'peer-id'


class Node {
  tor: Tor
  torPath: string
  pathDevLib: string
  hiddenServiceSecret: string | null
  peer: PeerId
  peerIdFileName: string | null

  constructor(torPath?: string, pathDevLib?: string, peerIdFileName?: string) {
    this.torPath = torPath || this.getTorPath()
    this.pathDevLib = pathDevLib || this.getPathDevLib()
    this.peerIdFileName = peerIdFileName || this.getPeerIdFileName()
  }

  public getHiddenServiceSecret (): string {
    return process.env.HIDDEN_SERVICE_SECRET
  }

  public getPeerIdFileName (): string {
    console.log('PEERID_FILE', process.env.PEERID_FILE)
    return process.env.PEERID_FILE
  }

  private getTorPath(): string {
    return `${process.cwd()}/tor/tor`
  }

  private getPathDevLib(): string {
    const pathDevLib = path.join.apply(null, [process.cwd(), 'tor'])
    if (!fs.existsSync(ZBAY_DIR_PATH)) {
      fs.mkdirSync(ZBAY_DIR_PATH)
    }
    return pathDevLib
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
    this.tor = await this.spawnTor()
    const onionAddress = await this.spawnService()
    console.log('onion', onionAddress)
    const dataServer = this.initDataServer()
    const connectonsManager = await this.initStorage(dataServer, onionAddress)
    await this.initListeners(dataServer, connectonsManager)
  }

  async spawnTor (): Promise<Tor> {
    const tor = new Tor({
      torPath: this.torPath,
      appDataPath: ZBAY_DIR_PATH,
      controlPort: 9051,
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
    let service: string
    try {
      service = this.tor.getServiceAddress(7788)
    } catch (e) {
      if (this.getHiddenServiceSecret()) {
        service = await (await this.tor.addOnion({virtPort: 7788, targetPort: 7788, privKey: this.getHiddenServiceSecret()}))
      } else {
        service = await (await this.tor.addNewService(7788, 7788)).onionAddress
      }
    }
    return `${service}.onion`
  }

  initDataServer(): DataServer {
    console.log('Init DataServer')
    const dataServer = new DataServer()
    dataServer.listen()
    return dataServer
  }

  async initStorage(dataServer: DataServer, host: string): Promise<ConnectionsManager> {
    const peer = await this.getPeer()
    const connectonsManager = new ConnectionsManager({
      port: 7788,
      host: host,
      agentHost: 'localhost',
      agentPort: 9050,
      io: dataServer.io
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
  // const torPath = `${process.cwd()}/tor/tor`
  // const pathDevLib = path.join.apply(null, [process.cwd(), 'tor'])
  // if (!fs.existsSync(ZBAY_DIR_PATH)) {
  //   fs.mkdirSync(ZBAY_DIR_PATH)
  // }
  // const tor = new Tor({
  //   torPath,
  //   appDataPath: ZBAY_DIR_PATH,
  //   controlPort: 9051,
  //   options: {
  //     env: {
  //       LD_LIBRARY_PATH: pathDevLib,
  //       HOME: os.homedir()
  //     },
  //     detached: true
  //   }
  // })
  // await tor.init()
  // console.log('afeter tor init')
  // let service1: string
  // try {
  //   service1 = await tor.getServiceAddress(7788)
  // } catch (e) {
  //   if (process.env.HIDDEN_SERVICE_SECRET) {
  //     service1 = await (await tor.addOnion({virtPort: 7788, targetPort: 7788, privKey: process.env.HIDDEN_SERVICE_SECRET}))
  //   } else {
  //     service1 = await (await tor.addNewService(7788, 7788)).onionAddress
  //   }
  // }

  // console.log(service1)
  // const dataServer = new DataServer()
  // dataServer.listen()
  // const peerId = fs.readFileSync('entryNodePeerId.json')
  // const parsedId = JSON.parse(peerId.toString()) as PeerId.JSONPeerId
  // const peerIdRestored = await PeerId.createFromJSON(parsedId)
  // const connectonsManager = new ConnectionsManager({
  //   port: 7788,
  //   host: `${service1}.onion`,
  //   agentHost: 'localhost',
  //   agentPort: 9050,
  //   io: dataServer.io
  // })
  // const node = await connectonsManager.initializeNode(peerIdRestored)
  // await connectonsManager.initStorage()
  // console.log(node)
  // initListeners(dataServer.io, connectonsManager)

}



main()
