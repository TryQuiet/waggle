import { Node } from '../entryNode'
import { ZBAY_DIR_PATH } from '../constants'
import { StorageTestSnapshot } from '../storage/storageSnapshot'
import WebsocketsOverTor from '../libp2p/websocketOverTor'
import Websockets from 'libp2p-websockets'

class LocalNode extends Node {
  createSnapshot: boolean
  appDataPath: string

  constructor(
    torPath?: string, 
    pathDevLib?: string, 
    peerIdFileName?: string, 
    port = 7788, 
    socksProxyPort = 9050, 
    torControlPort = 9051, 
    hiddenServicePort = 7788, 
    torAppDataPath = ZBAY_DIR_PATH,
    hiddenServiceSecret?: string,
    createSnapshot?: boolean,
    appDataPath?: string
    ) {

    let _port: number = port
    if (process.env.TOR_PORT) {
      _port = Number(process.env.TOR_PORT)
    }    
    super(torPath, pathDevLib, peerIdFileName, _port, socksProxyPort, torControlPort, hiddenServicePort, torAppDataPath, hiddenServiceSecret)
    this.createSnapshot = createSnapshot
    this.appDataPath = appDataPath
  }
}


export class NodeWithoutTor extends LocalNode {

  public async init(): Promise<void> {
    console.log('USING NodeWithoutTor')
    const dataServer = await this.initDataServer()
    const connectonsManager = await this.initStorage(
      dataServer, 
      '0.0.0.0', 
      StorageTestSnapshot,
      {
        bootstrapMultiaddrs: ['/dns4/0.0.0.0/tcp/7788/ws/p2p/QmRbkBkhTt2DbLMF8kAaf1oxpfKQuEfLKFzVCDzQhabwkw'], 
        createSnapshot: this.createSnapshot,
        useSnapshot: true,
        env: {
          appDataPath: this.appDataPath
        },
        libp2pTransport: Websockets
      }
    )
    await this.initListeners(dataServer, connectonsManager)
  }
}

export class NodeWithTor extends LocalNode {

  public async init(): Promise<void> {
    console.log('USING NodeWithTor')
    this.tor = await this.spawnTor()
    const onionAddress = await this.spawnService()
    console.log('onion', onionAddress)
    const dataServer = await this.initDataServer()
    console.log('INITING STORAGE')
    const connectonsManager = await this.initStorage(
      dataServer, 
      onionAddress, 
      StorageTestSnapshot,
      {
        bootstrapMultiaddrs: [
         '/dns4/ix2oumqrtjaupt53l6cqpk6ct6iaa5guconwgtvgdk2v3i5wjiyehryd.onion/tcp/7788/ws/p2p/QmRbkBkhTt2DbLMF8kAaf1oxpfKQuEfLKFzVCDzQhabwkw',
      ],
        createSnapshot: this.createSnapshot,
        useSnapshot: true,
        env: {
          appDataPath: this.appDataPath
        },
        libp2pTransport: WebsocketsOverTor
      }
      )
    await this.initListeners(dataServer, connectonsManager)
  }
}