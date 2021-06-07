import { Tor } from './torManager'
import { DataServer } from './socket/DataServer'
import { ConnectionsManager } from './libp2p/connectionsManager'
import initListeners from './socket/listeners'
const version =  require('./../package.json').version

export default {
  Tor,
  DataServer,
  ConnectionsManager,
  initListeners,
  version
}
