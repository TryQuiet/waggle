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

function getRandomInt(min=null, max=null) {
  const ports = [1000, 65536]
  min = Math.ceil(ports[0]);
  max = Math.floor(ports[1]);
  return Math.floor(Math.random() * (max - min)) + min;
}

export const getPorts = async (): Promise<Ports> => {
  const [controlPort] = await fp(9151)
  const [socksPort] = await fp(9052)
  const [libp2pHiddenService] = await fp(getRandomInt())
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
  if (!basePath) {
    basePath = process.cwd()
  }
  return path.join(basePath, 'tor', process.platform)
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
