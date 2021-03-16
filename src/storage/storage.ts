import IPFS from 'ipfs'
import path from 'path'
import { ZBAY_DIR_PATH } from '../constants'
import { createPaths } from '../utils'
import OrbitDB from 'orbit-db'
import KeyValueStore from 'orbit-db-kvstore'
import EventStore from 'orbit-db-eventstore'
import PeerId from 'peer-id'
import { message as socketMessage } from '../socket/events/message'
import { loadAllMessages } from '../socket/events/allMessages'
import { EventTypesResponse } from '../socket/constantsReponse'

export interface IMessage {
  id: string
  type: number
  typeIndicator: number
  message: string
  createdAt: number
  r: number
  channelId: string
  signature: string
}

interface IRepo {
  db: EventStore<IMessage>
}

interface IChannelInfo {
  displayName: string
  description: string
  owner: string
  timestamp: number
  address: string
}

interface IZbayChannel {
  orbitAddress: string
  name: string
  displayName?: string
  description?: string
  owner?: string
  timestamp?: number
}

export class Storage {
  private ipfs: IPFS.IPFS
  private orbitdb: OrbitDB
  private channels: KeyValueStore<IZbayChannel>
  public repos: Map<String, IRepo> = new Map()

  public async init(libp2p: any, peerID: PeerId): Promise<void> {
    const ipfsRepoPath = path.join(ZBAY_DIR_PATH, 'ZbayChannels')
    const orbitDbDir = path.join(ZBAY_DIR_PATH, 'OrbitDB')
    createPaths([ipfsRepoPath, orbitDbDir])
    this.ipfs = await IPFS.create({
      libp2p: () => libp2p,
      preload: { enabled: false },
      repo: ipfsRepoPath,
      EXPERIMENTAL: {
        ipnsPubsub: true
      },
      // @ts-ignore
      privateKey: peerID.toJSON().privKey 
    })

    this.orbitdb = await OrbitDB.createInstance(this.ipfs, {directory: orbitDbDir})
    await this.createDbForChannels()
    await this.subscribeForAllChannels()
  }

  private async createDbForChannels() {
    this.channels = await this.orbitdb.keyvalue<IZbayChannel>('zbay-public-channels', {
      accessController: {
        write: ['*']
      },
      replicate: true
    })
    this.channels.events.on('replicated', () => {
      console.log('REPLICATED CHANNELS')
    })
    await this.channels.load()
    // for (const channel of Object.values(this.channels.all)) {
    //   if (!channel.displayName) {
    //     console.log(`Deleting ${channel.name}`)
    //     await this.channels.del(channel.name)
    //   }
      
    // }
    console.log('ALL CHANNELS COUNT:', Object.keys(this.channels.all).length)
  }

  async subscribeForAllChannels() {
    for (const channelData of Object.values(this.channels.all)) {
      if (!this.repos.has(channelData.name)) {
        await this.createChannel(channelData.name)
      }
    }
  }

  public async updateChannels(io) {  // attach socket to channel db events - update list of available public channels
    console.log('Attaching to DB event')
    this.initPublicChannels(io)
    this.channels.events.on('replicated', (address) => {
      const allChannels = this.channels.all
      console.log(`Sending info to Client (${address})`, Object.keys(allChannels).length)
      io.emit(EventTypesResponse.RESPONSE_GET_PUBLIC_CHANNELS, allChannels)
    })
  }

  private async initPublicChannels(io) {
    if (this.channels) {
      io.emit(EventTypesResponse.RESPONSE_GET_PUBLIC_CHANNELS, this.channels.all)
    }
  }

  public async insertData(channelInfo) {  // only for test, remove later
    console.log('Inserting data ', channelInfo)
    await this.createChannel(channelInfo.address, channelInfo)
  }

  public async subscribeForChannel(channelAddress: string, io: any): Promise<void> {
    if (this.repos.has(channelAddress)) return

    console.log('Subscribing to channel', channelAddress)
    const db = await this.createChannel(channelAddress)

    db.events.on('write', (_address, entry) => {
      socketMessage(io, { message: entry.payload.value, channelAddress })
    })
    db.events.on('replicated', () => {
      const all = db
        .iterator({ limit: -1 })
        .collect()
        .map(e => e.payload.value)
      loadAllMessages(io, all, channelAddress)
    })
    const all = db
      .iterator({ limit: -1 })
      .collect()
      .map(e => e.payload.value)
    loadAllMessages(io, all, channelAddress)
    console.log('Subscribtion to channel ready', channelAddress)
  }

  public async sendMessage(channelAddress: string, io: any, message: IMessage) {
    await this.subscribeForChannel(channelAddress, io)
    const db = this.repos.get(channelAddress).db
    db.events.on('write', (address, entry, heads) => {
      console.log('WRITE MESSAGE TO DB', entry)
      const all = db
        .iterator({ limit: -1 })
        .collect()
        .map(e => e.payload.value)
      console.log(`Count messages in ${entry.id}: ${all.length}`)  
    })
    await db.add(message)
  }

  private async createChannel(repoName: string, channelData?: IChannelInfo): Promise<EventStore<IMessage>> {
    const channel = this.channels.get(repoName)
    let db: EventStore<IMessage>
    if (channel) {
      db = await this.orbitdb.log<IMessage>(channel.orbitAddress)
      await db.load()
    } else {
      db = await this.orbitdb.log<IMessage>(`zbay.channels.${repoName}`, {
        accessController: {
          write: ['*']
        }
      })
      await this.channels.put(repoName, {
        orbitAddress: `/orbitdb/${db.address.root}/${db.address.path}`,
        name: repoName,
        ...channelData
      })
      console.log(`Created channel ${repoName}`)
    }
    this.repos.set(repoName, { db })
    return db
  }
}
