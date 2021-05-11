import { Tor } from './torManager'
import {Storage } from './storage'
import { DataServer } from './socket/DataServer'
import { ConnectionsManager } from './libp2p/connectionsManager'
import initListeners from './socket/listeners/'
import {ZBAY_DIR_PATH} from './constants'
import * as path from 'path'
import * as os from 'os'
import fs from 'fs'
import PeerId from 'peer-id'

const main = async () => {
  const torPath = `${process.cwd()}/tor/tor`
  const pathDevLib = path.join.apply(null, [process.cwd(), 'tor'])
  if(!fs.existsSync(ZBAY_DIR_PATH)) {
    fs.mkdirSync(ZBAY_DIR_PATH)
  }
  const tor = new Tor({
    torPath,
    appDataPath: ZBAY_DIR_PATH,
    controlPort: 9051,
    options: {
      env: {
        LD_LIBRARY_PATH: pathDevLib,
        HOME: os.homedir()
      },
      detached: true
    }
  })
  await tor.init()
  console.log('afeter tor init')
  let service1: string
  try {
    service1 = await tor.getServiceAddress(7788)
  } catch (e) {
    service1 = await (await tor.addNewService(7788 ,7788)).onionAddress
  }

  console.log(service1)
  const dataServer = new DataServer()
  dataServer.listen()
  const peerId = fs.readFileSync('peerId1.json')
  const parsedId = JSON.parse(peerId.toString()) as PeerId.JSONPeerId
  const peerIdRestored = await PeerId.createFromJSON(parsedId)
  const connectonsManager = new ConnectionsManager({
    port: 7788,
    host: `${service1}.onion`,
    agentHost: 'localhost',
    agentPort: 9050,
    io: dataServer.io
  })
  const node = await connectonsManager.initializeNode(peerIdRestored)
  console.log(node)
  initListeners(dataServer.io, connectonsManager)
}

main()
