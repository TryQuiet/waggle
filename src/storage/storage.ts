import IPFS from 'ipfs'
import os from 'os'
import fs from 'fs'
import OrbitDB from 'orbit-db'
import KeyValueStore from 'orbit-db-kvstore'
import EventStore from 'orbit-db-eventstore'
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

const channelAddress =
  '/orbitdb/zdpuAmqqhvij9w3wqbSEam9p3V6HaPKDKUHTsfREnYCFiWAm3/zbay-public-channels'



export class Storage {
  private ipfs: IPFS.IPFS
  private orbitdb: OrbitDB
  private channels: KeyValueStore<IZbayChannel>
  public repos: Map<String, IRepo> = new Map()

  private logEvents(db) {
    db.events.on('write', (_address, entry) => {
      console.log('Event WRITE: ', _address, entry)
    })

    db.events.on('replicate.progress', (address, hash, entry, progress, have) => {
      console.log('Event REPLICATE.PROGRESS: ', address)
    })

    db.events.on('replicate', (address) => {
      console.log('Event REPLICATE (before): ', address)
    })

    db.events.on('replicated', (address) => {
      console.log('Event REPLICATED (after): ', address)
    })

    db.events.on('peer.exchanged', (peer, address, heads) => {
      console.log('Event PEER.EXCHANGED')
      console.log('=== All channels', this.channels.all)
      console.log('=== Channels count --->', this.channels.all.length)
    })

    db.events.on('peer', (peer) => {
      console.log('PEER connected: ', peer)
    })

    db.events.on('load.progress', (address, hash, entry, progress, total) => {
      console.log('____')
      console.log('loading db ', progress, '/', total)
      console.log('loading db', entry)
      console.log('____')
    })
  }

  public async init(libp2p: any): Promise<void> {
    const targetPath = `${os.homedir()}/.zbay/ZbayChannels/`
    this.createPaths([targetPath])
    this.ipfs = await IPFS.create({
      libp2p: () => libp2p,
      preload: { enabled: false },
      repo: targetPath
    })
    console.log('before create db instance')
    this.orbitdb = await OrbitDB.createInstance(this.ipfs, {directory: `${os.homedir()}/.zbay/OrbitDB`})
    console.log('before this.orbitdb.keyvalue ')
    this.channels = await this.orbitdb.keyvalue<IZbayChannel>('zbay-public-channels', {
      accessController: {
        write: ['*']
      }
    })

    this.logEvents(this.channels)

    await this.channels.load()
    console.log('after channels.load()')
    console.log('Init - all channels:', this.channels.all)
    console.log('Init - all channels count:', this.channels.all.length)
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
    await db.add(message)
  }

  private async createChannel(repoName: string): Promise<EventStore<IMessage>> {
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
        name: repoName
      })
    }
    this.repos.set(repoName, { db })
    return db
  }

  private createPaths(paths: string[]) {
    for (const path of paths) {
      if (!fs.existsSync(path)) {
        fs.mkdirSync(path, { recursive: true })
      }
    }
  }
}
