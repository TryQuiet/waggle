import fs from 'fs'
import fp from 'find-free-port'
import path from 'path'
import SocketIO from 'socket.io'
import debug from 'debug'

const log = Object.assign(debug('waggle:test'), {
  error: debug('waggle:test:err')
})

export interface Ports {
  socksPort: number
  libp2pHiddenService: number
  controlPort: number
  dataServer: number
}

export function createPaths(paths: string[]) {
  for (const path of paths) {
    if (!fs.existsSync(path)) {
      fs.mkdirSync(path, { recursive: true })
    }
  }
}

export async function romveFilesFromDir(dirPath: string) {
  if (fs.existsSync(dirPath)) {
    fs.rmdirSync(dirPath, { recursive: true })
  }
}

export function fetchAbsolute(fetch: Function): Function {
  return (baseUrl: string) => (url: string, ...otherParams) =>
    url.startsWith('/') ? fetch(baseUrl + url, ...otherParams) : fetch(url, ...otherParams)
}

export const getPorts = async (): Promise<Ports> => {
  const [controlPort] = await fp(9151)
  const [socksPort] = await fp(9052)
  const [libp2pHiddenService] = await fp(7788)
  const [dataServer] = await fp(4677)
  return {
    socksPort,
    libp2pHiddenService,
    controlPort,
    dataServer
  }
}

export class DummyIOServer extends SocketIO.Server {
  emit(event: string, ...args: any[]): boolean {
    log(`Emitting ${event} with args:`, args)
    return true
  }
}

export const torBinForPlatform = (): string => {
  const ext = process.platform === 'win32' ? '.exe' : ''
  return path.join(torDirForPlatform(), 'tor'.concat(ext))
}

export const torDirForPlatform = (): string => {
  return path.join(process.cwd(), 'tor', process.platform)
}
