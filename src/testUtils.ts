import { ZBAY_DIR_PATH } from './constants'
import { getPorts } from './utils'
import { Tor } from './torManager'
import { ConnectionsManager } from './libp2p/connectionsManager'

export const spawnTorProcess = async (): Promise<Tor> => {
  const ports = await getPorts()
  const torPath = `${process.cwd()}/tor/tor`
  const libPath = `${process.cwd()}/tor`
  const tor = new Tor({
    appDataPath: ZBAY_DIR_PATH,
    torPath: torPath,
    controlPort: ports.controlPort,
    socksPort: ports.socksPort,
    options: {
      env: {
        LD_LIBRARY_PATH: libPath,
        HOME: ZBAY_DIR_PATH
      },
      detached: true
    }
  })
  return tor
}

export const createMinConnectionManager = (options = {}): ConnectionsManager => {
  return new ConnectionsManager({
    port: 1111,
    host: `abcd.onion`,
    agentHost: 'localhost',
    agentPort: 2222,
    io: null,
    options: {
      ...options
    }
  })
}
