import tmp from 'tmp'
import { Config, ZBAY_DIR_PATH } from './constants'
import { getPorts } from './utils'
import { Tor } from './torManager'
import { ConnectionsManager } from './libp2p/connectionsManager'
import path from 'path'
tmp.setGracefulCleanup()

export interface TmpDir {
  name: string,
  removeCallback: () => {}
}

export const spawnTorProcess = async (zbayDirPath: string): Promise<Tor> => {
  const ports = await getPorts()
  const torPath = `${process.cwd()}/tor/tor`
  const libPath = `${process.cwd()}/tor`
  const tor = new Tor({
    appDataPath: zbayDirPath,
    torPath: torPath,
    controlPort: ports.controlPort,
    socksPort: ports.socksPort,
    options: {
      env: {
        LD_LIBRARY_PATH: libPath,
        HOME: zbayDirPath
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

export const createTmpDir = (): TmpDir => {
  return tmp.dirSync({ mode: 0o750, prefix: 'zbayTestTmp_' , unsafeCleanup: true})
}

export const tmpZbayDirPath = (name: string): string => {
  return path.join(name, Config.ZBAY_DIR)
}
