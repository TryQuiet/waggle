import EventStore from 'orbit-db-eventstore'

export interface IMessage {
  id: string
  type: number
  message: string
  createdAt: number
  channelId: string
  signature: string
  pubKey: string
}

export interface IRepo {
  db: EventStore<IMessage>
  eventsAttached: boolean
}

export interface IChannelInfo {
  name: string
  description: string
  owner: string
  timestamp: number
  address: string
  keys: { ivk?: string, sk?: string }
}

export interface ChannelInfoResponse {
  [name: string]: IChannelInfo
}

export class StorageOptions {
  orbitDbDir?: string
  ipfsDir?: string
  createPaths: boolean = true
  isWaggleMobileMode: boolean
  isEntryNode?: boolean = false
}

export interface IZbayChannel extends IChannelInfo {
  orbitAddress: string
}

export interface IPublicKey {
  halfKey: string
}
export type IMessageThread = string

export class ConnectionsManagerOptions {
  env: {
    appDataPath?: string
  } = {}

  bootstrapMultiaddrs?: string[] = []
  createPaths?: boolean = true
  isWaggleMobileMode?: boolean = true
  isEntryNode?: boolean = false
  createSnapshot?: boolean = false
  useSnapshot?: boolean = false
  libp2pTransportClass?: any = null
  spawnTor?: boolean = true
  torControlPort?: number
  torPassword?: string
}

export interface IConstructor {
  host: string
  port: number
  agentPort?: number
  agentHost?: string
  options?: Partial<ConnectionsManagerOptions>
  io: any
  storageClass?: any // TODO: what type?
}

export interface ILibp2pStatus {
  address: string
  peerId: string
}

export interface DataFromPems {
  certificate: string
  privKey: string
}
