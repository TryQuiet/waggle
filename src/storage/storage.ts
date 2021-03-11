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

interface IZbayChannel {
  orbitAddress: string
  name: string
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
    this.logEvents(this.channels)
    await this.channels.load()
  }

  async subscribeForAllChannels() {
    for (const channelData of Object.values(this.channels.all)) {
      if (!this.repos.has(channelData.name)) {
        await this.createChannel(channelData.name)
      }
    }
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

      console.log('Replicated messages:', all)
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
    console.log(`Sending a ${message.message} to ${channelAddress}`)
    await this.subscribeForChannel(channelAddress, io)
    const db = this.repos.get(channelAddress).db
    this.logEvent(db)
    await db.load()
    await db.add(message)
  }

  private logEvent(db) {
    db.events.on('replicated', async (address) => {
      const all = db
        .iterator({ limit: -1 })
        .collect()
        .map(e => e.payload.value)
      console.log('*= REPLICATED MESSAGES: ', address)
      console.log('*= Replication status', db.replicationStatus)
      console.log('*= Messages:', all)
    })
  }

  private async createChannel(repoName: string): Promise<EventStore<IMessage>> {
    const channel = this.channels.get(repoName)
    let db: EventStore<IMessage>
    if (channel) {
      db = await this.orbitdb.log<IMessage>(channel.orbitAddress)
      this.logEvent(db)
      await db.load()
    } else {
      db = await this.orbitdb.log<IMessage>(`zbay.channels.${repoName}`, {
        accessController: {
          write: ['*']
        }
      })
      this.logEvent(db)
      await this.channels.put(repoName, {
        orbitAddress: `/orbitdb/${db.address.root}/${db.address.path}`,
        name: repoName
      })
      console.log(`Created channel ${repoName}`)
    }
    this.repos.set(repoName, { db })
    return db
  }

  private logEvents(db) {
    console.log('Replication status', db.replicationStatus)

    db.events.on('write', (_address, entry) => {
      console.log('Replication status', db.replicationStatus)
      console.log('Event WRITE: ', _address, entry)
    })

    db.events.on('replicate.progress', (address, hash, entry, progress, have) => {
      console.log('Event REPLICATE.PROGRESS: ', address)
    })

    db.events.on('replicate', (address) => {
      console.log('Event REPLICATE (before): ', address)
    })

    db.events.on('replicated', async (address) => {
      console.log('* Event REPLICATED (after): ', address)
      console.log('* Replication status', db.replicationStatus)
      await this.subscribeForAllChannels()
    })

    db.events.on('peer.exchanged', (peer, address, heads) => {
      console.log('Event PEER.EXCHANGED')
    })

    db.events.on('peer', (peer) => {
      console.log('Event PEER: ', peer)
    })

    db.events.on('load.progress', (address, hash, entry, progress, total) => {
      console.log(`Event LOAD.PROGRESS ===> ${progress}/${total}`)
    })
  }
}
