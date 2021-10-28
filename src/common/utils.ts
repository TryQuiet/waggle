import fp from 'find-free-port'
import fs from 'fs'
import fetch, { Response } from 'node-fetch'
import path from 'path'
import SocketIO from 'socket.io'
import logger from '../logger'
const log = logger('utils')

export interface Ports {
  socksPort: number
  libp2pHiddenService: number
  controlPort: number
  dataServer: number
  httpTunnelPort: number
}

export function createPaths(paths: string[]) {
  for (const path of paths) {
    if (!fs.existsSync(path)) {
      fs.mkdirSync(path, { recursive: true })
    }
  }
}

export function removeFilesFromDir(dirPath: string) {
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
  const [httpTunnelPort] = await fp(9000)
  return {
    socksPort,
    libp2pHiddenService,
    controlPort,
    dataServer,
    httpTunnelPort
  }
}

export class DummyIOServer extends SocketIO.Server {
  emit(event: string, ...args: any[]): boolean {
    log(`Emitting ${event} with args:`, args)
    return true
  }

  close() {
    log('Closing DummyIOServer')
  }
}

export const torBinForPlatform = (basePath?: string): string => {
  const ext = process.platform === 'win32' ? '.exe' : ''
  return path.join(torDirForPlatform(basePath), 'tor'.concat(ext))
}

export const torDirForPlatform = (basePath?: string): string => {
  let path
  if (!basePath) {
    basePath = process.cwd()
    path = path.join(basePath, 'tor', process.platform)
  } else {
    path.join(basePath, 'tor')
  }
  return path
}

export const fetchRetry = async (address: string, options: any, retryCount: number): Promise<Response> => {
  return await fetch(address, options).catch(async (error) => {
    if (retryCount === 1) {
      throw error
    }
    const retriesLeft = retryCount - 1
    log(`Connecting to ${address} failed, trying again... Attempts left: ${retriesLeft}`)
    return await fetchRetry(address, options, retriesLeft)
  })
}
