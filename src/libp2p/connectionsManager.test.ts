import { ConnectionsManager } from './connectionsManager'
import { DataServer } from '../socket/DataServer'
import { ZBAY_DIR_PATH } from '../constants'
import { Tor } from '../torManager/index'
import {getPorts} from '../utils'
import path from 'path'
import os from 'os'
import { connections } from '../socket/listeners/connection'
import { sleep } from '../sleep'
jest.setTimeout(150_000)


test('start and close connectionsManager', async () => {

const ports = await getPorts()
const torPath = `${process.cwd()}/tor/tor`
  const pathDevLib = path.join.apply(null, [process.cwd(), 'tor'])
  // const dataServer = new DataServer()
  // await dataServer.listen()
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
  // const service1 = await tor.addNewService(7788, 7788)
  
  const connectionsManager = new ConnectionsManager({
    port: ports.libp2pHiddenService,
    host: `.onion`,
    agentHost: 'localhost',
    agentPort: ports.socksPort,
    io: 'asdf' as any,
    options: {
      env: {
        appDataPath: `${ZBAY_DIR_PATH}`
      }
    }
  })

  //await connectionsManager.initializeNode()
  await connectionsManager.initStorage()
  
  //await connectionsManager.closeStorage()
  //await connectionsManager.stopLibp2p()
  // await dataServer.close()
  // await tor.kill()
})
