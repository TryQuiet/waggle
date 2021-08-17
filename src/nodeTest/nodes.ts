import Node from '../node'
import { ZBAY_DIR_PATH } from '../constants'
import { StorageTestSnapshot } from '../storage/storageSnapshot'
import WebsocketsOverTor from '../libp2p/websocketOverTor'
import Websockets from 'libp2p-websockets'
import { Storage } from '../storage/storage'


class TestStorageOptions {
  createSnapshot?: boolean
  messagesCount: number
  useSnapshot?: boolean
}

export class LocalNode extends Node {
  // createSnapshot: boolean
  // useSnapshot: boolean
  // messagesCount: number
  storageOptions: any
  appDataPath: string
  storage: any  // Storage | StorageTestSnapshot
  bootstrapMultiaddrs: string[]

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
    storageOptions?: TestStorageOptions,
    appDataPath?: string,
    bootstrapMultiaddrs?: string[]
    ) {

    let _port: number = port
    if (process.env.TOR_PORT) {
      _port = Number(process.env.TOR_PORT)
    }    
    super(torPath, pathDevLib, peerIdFileName, _port, socksProxyPort, torControlPort, hiddenServicePort, torAppDataPath, hiddenServiceSecret)
    this.storageOptions = storageOptions
    // this.createSnapshot = storageOptions.createSnapshot
    // this.useSnapshot = storageOptions.useSnapshot
    // this.messagesCount = storageOptions.messagesCount
    this.appDataPath = appDataPath
    this.bootstrapMultiaddrs = bootstrapMultiaddrs
  }
}


export class NodeWithoutTor extends LocalNode {

  public async init(): Promise<void> {
    console.log('USING NodeWithoutTor')
    const dataServer = await this.initDataServer()
    const connectonsManager = await this.initConnectionsManager(
      dataServer, 
      '0.0.0.0', 
      StorageTestSnapshot,
      {
        bootstrapMultiaddrs: this.bootstrapMultiaddrs, 
        ...this.storageOptions,
        // createSnapshot: this.storageOptions.createSnapshot,
        // useSnapshot: this.storageOptions.useSnapshot,
        // messagesCount: this.storageOptions.messagesCount,
        env: {
          appDataPath: this.appDataPath
        },
        libp2pTransport: Websockets
      }
    )
    this.storage = connectonsManager.storage
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
    const connectonsManager = await this.initConnectionsManager(
      dataServer, 
      onionAddress, 
      StorageTestSnapshot,
      {
        bootstrapMultiaddrs: this.bootstrapMultiaddrs,
        ...this.storageOptions,
        // createSnapshot: this.storageOptions.createSnapshot,
        // useSnapshot: this.storageOptions.useSnapshot,
        // messagesCount: this.storageOptions.messagesCount,
        env: {
          appDataPath: this.appDataPath
        },
        libp2pTransport: WebsocketsOverTor
      }
    )
    this.storage = connectonsManager.storage
    await this.initListeners(dataServer, connectonsManager)
  }
}