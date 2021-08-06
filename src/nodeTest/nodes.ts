import { Node } from '../entryNode'
import { ZBAY_DIR_PATH } from '../constants'
import { StorageTestSnapshot } from '../storage/storageSnapshot'
import { createTmpDir, tmpZbayDirPath } from '../testUtils'

class LocalNode extends Node {
  constructor(torPath?: string, pathDevLib?: string, peerIdFileName?: string, port = 7788, socksProxyPort = 9050, torControlPort = 9051, hiddenServicePort = 7788, torAppDataPath = ZBAY_DIR_PATH) {
    console.log('LocalNodeLocalNodeLocalNodeLocalNodeLocalNode')
    let _port: number = port
    if (process.env.TOR_PORT) {
      _port = Number(process.env.TOR_PORT)
    }
    // const tmpDir = createTmpDir()
    // const tmpAppDataPath = tmpZbayDirPath(tmpDir.name)
    // console.log('tmpAppDataPath::::::::', tmpAppDataPath)
    super(torPath, pathDevLib, peerIdFileName, _port, socksProxyPort, torControlPort, hiddenServicePort, torAppDataPath)
  }
}


export class NodeWithoutTor extends LocalNode {

  public async init(): Promise<void> {
    console.log('USING NodeWithoutTor')
    const dataServer = await this.initDataServer()
    const connectonsManager = await this.initStorage(dataServer, '0.0.0.0', StorageTestSnapshot)
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
    const connectonsManager = await this.initStorage(dataServer, onionAddress, StorageTestSnapshot)
    await this.initListeners(dataServer, connectonsManager)
  }
}

const main = async () => {
  let node: Node
  console.log('PROCESS USE TOR?', process.env.USE_TOR)
  console.log('PROCESS BOOTSTRAP_ADDRS?', process.env.BOOTSTRAP_ADDRS)
  if (process.env.USE_TOR === "true") {
    node = new NodeWithTor()
  } else {
    node = new NodeWithoutTor()
  }
  await node.init()
}

main().catch(err => {
  console.log(`Couldn't start node: ${err as string}`)
})
