import IPFS from 'ipfs'
import path from 'path'
import { createPaths } from '../utils'
import OrbitDB from 'orbit-db'
import KeyValueStore from 'orbit-db-kvstore'
import EventStore from 'orbit-db-eventstore'
import PeerId from 'peer-id'
import { message as socketMessage, directMessage as socketDirectMessage } from '../socket/events/message'
import { loadAllMessages, loadAllDirectMessages } from '../socket/events/allMessages'
import { EventTypesResponse } from '../socket/constantsReponse'
import fs from 'fs'

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

interface ChannelInfoResponse {
  [name: string]: IChannelInfo
}

interface IZbayChannel extends IChannelInfo {
  orbitAddress: string
}

interface IPublicKey {
  halfKey: string
}
type IMessageThread = string

export class Storage {
  constructor(zbayDir: string) {
    this.zbayDir = zbayDir
  }

  private readonly zbayDir: string
  private ipfs: IPFS.IPFS
  private orbitdb: OrbitDB
  private channels: KeyValueStore<IZbayChannel>
  private directMessages: KeyValueStore<IPublicKey>
  private messageThreads: KeyValueStore<IMessageThread>
  public repos: Map<String, IRepo> = new Map()
  public directMessagesRepos: Map<String, IRepo> = new Map()

  public async init(libp2p: any, peerID: PeerId): Promise<void> {
    const ipfsRepoPath = path.join(this.zbayDir, 'ZbayChannels')
    const orbitDbDir = path.join(this.zbayDir, 'OrbitDB')
    createPaths([ipfsRepoPath, orbitDbDir])
    this.ipfs = await IPFS.create({
      libp2p: () => libp2p,
      preload: { enabled: false },
      repo: ipfsRepoPath,
      EXPERIMENTAL: {
        ipnsPubsub: true
      },
      // @ts-expect-error
      privateKey: peerID.toJSON().privKey
    })

    this.orbitdb = await OrbitDB.createInstance(this.ipfs, { directory: orbitDbDir })
    await this.createDbForChannels()
    await this.subscribeForAllChannels()
    await this.createDbForDirectMessages()
    await this.createDbForMessageThreads()
    // await this.subscribeForAllMessageThreads()
  }

  public async loadInitChannels() {
    // Temp, only for entrynode
    const initChannels: ChannelInfoResponse = JSON.parse(
      fs.readFileSync('initialPublicChannels.json').toString()
    )
    for (const channel of Object.values(initChannels)) {
      await this.createChannel(channel.address, channel)
    }
  }

  private async createDbForChannels() {
    this.channels = await this.orbitdb.keyvalue<IZbayChannel>('zbay-public-channels', {
      accessController: {
        write: ['*']
      }
    })
    this.channels.events.on('replicated', () => {
      console.log('REPLICATED CHANNELS')
    })
    await this.channels.load()
    console.log('ALL CHANNELS COUNT:', Object.keys(this.channels.all).length)
    console.log('ALL CHANNELS COUNT:', Object.keys(this.channels.all))
  }

  private async createDbForMessageThreads() {
    this.messageThreads = await this.orbitdb.keyvalue<IMessageThread>('message-threads', {
      accessController: {
        write: ['*']
      }
    })
    this.messageThreads.events.on('replicated', () => {
      console.log('REPLICATED CONVERSATIONS-ID')
    })
    await this.messageThreads.load()
    console.log('ALL MESSAGE THREADS COUNT:', Object.keys(this.messageThreads.all).length)
    console.log('ALL MESSAGE THREADS COUNT:', Object.keys(this.messageThreads.all))
  }

  private async createDbForDirectMessages() {
    this.directMessages = await this.orbitdb.keyvalue<IPublicKey>('direct-messages', {
      accessController: {
        write: ['*']
      }
    })
    this.directMessages.events.on('replicated', () => {
      console.log('REPLICATED USERS')
    })
    await this.directMessages.load()
    console.log('ALL USERS COUNT:', Object.keys(this.directMessages.all).length)
    console.log('ALL USERS COUNT:', Object.keys(this.directMessages.all))
  }

  async subscribeForAllChannels() {
    for (const channelData of Object.values(this.channels.all)) {
      if (!this.repos.has(channelData.address)) {
        await this.createChannel(channelData.address, channelData)
      }
    }
  }

  // async subscribeForAllMessageThreads() {
  //   for (const messageThread of Object.values(this.messageThreads.all)) {
  //     if (!this.directMessagesRepos.has(messageThread.id)) {
  //       await this.createDirectMessageThread(messageThread)
  //     }
  //   }
  // }

  private getChannelsResponse(): ChannelInfoResponse {
    const channels: ChannelInfoResponse = {}
    for (const channel of Object.values(this.channels.all)) {
      if (channel.keys) {
        // TODO: create proper validators
        channels[channel.name] = {
          address: channel.address,
          description: channel.description,
          owner: channel.owner,
          timestamp: channel.timestamp,
          keys: channel.keys,
          name: channel.name
        }
      }
    }
    return channels
  }

  public async updateChannels(io) {
    /** Update list of available public channels */
    io.emit(EventTypesResponse.RESPONSE_GET_PUBLIC_CHANNELS, this.getChannelsResponse())
  }

  private getAllChannelMessages(db: EventStore<IMessage>): IMessage[] {
    // TODO: move to e.g custom Store
    return db
      .iterator({ limit: -1 })
      .collect()
      .map(e => e.payload.value)
  }

  public loadAllChannelMessages(channelAddress: string, io: any) {
    // Load all channel messages for subscribed channel
    if (!this.repos.has(channelAddress)) {
      return
    }
    const db: EventStore<IMessage> = this.repos.get(channelAddress).db
    loadAllMessages(io, this.getAllChannelMessages(db), channelAddress)
  }

  public async subscribeForChannel(
    channelAddress: string,
    io: any,
    channelInfo?: IChannelInfo
  ): Promise<void> {
    console.log('Subscribing to channel ', channelAddress)
    let db: EventStore<IMessage>
    let repo = this.repos.get(channelAddress)

    if (repo) {
      db = repo.db
    } else {
      db = await this.createChannel(channelAddress, channelInfo)
      if (!db) {
        console.log(`Can't subscribe to channel ${channelAddress}`)
        return
      }
      repo = this.repos.get(channelAddress)
    }

    if (repo && !repo.eventsAttached) {
      console.log('Subscribing to channel ', channelAddress)
      db.events.on('write', (_address, entry) => {
        console.log('Writing to messages db')
        socketMessage(io, { message: entry.payload.value, channelAddress })
      })
      db.events.on('replicated', () => {
        console.log('Message replicated')
        loadAllMessages(io, this.getAllChannelMessages(db), channelAddress)
      })
      repo.eventsAttached = true
      loadAllMessages(io, this.getAllChannelMessages(db), channelAddress)
      console.log('Subscription to channel ready', channelAddress)
    }
  }

  // DIRECT MESSAGES

  public async sendMessage(channelAddress: string, io: any, message: IMessage) {
    await this.subscribeForChannel(channelAddress, io) // Is it necessary?
    const db = this.repos.get(channelAddress).db
    await db.add(message)
  }

  private async createChannel(
    channelAddress: string,
    channelData?: IChannelInfo
  ): Promise<EventStore<IMessage>> {
    if (!channelAddress) {
      console.log('No channel address, can\'t create channel')
      return
    }

    const db: EventStore<IMessage> = await this.orbitdb.log<IMessage>(
      `zbay.channels.${channelAddress}`,
      {
        accessController: {
          write: ['*']
        }
      }
    )
    await db.load()

    const channel = this.channels.get(channelAddress)
    if (!channel) {
      await this.channels.put(channelAddress, {
        orbitAddress: `/orbitdb/${db.address.root}/${db.address.path}`,
        address: channelAddress,
        ...channelData
      })
      console.log(`Created channel ${channelAddress}`)
    }
    this.repos.set(channelAddress, { db, eventsAttached: false })
    return db
  }

  // private async createDirectMessage

  // public async createDirectMessageThread(address: string) {
  //   const db: EventStore<IMessage> = await this.orbitdb.log<IMessage>(
  //     `direct.messages.${address}`,
  //     {
  //       accessController: {
  //         write: ['*']
  //       }
  //     }
  //   )
  //   this.directMessagesRepos.set(address, {db, eventsAttached: true})
  // }

  public async addUser(address: string, halfKey: string): Promise<void> {
    await this.directMessages.put(address, { halfKey })
  }

  public async initializeConversation(address: string, encryptedPhrase: string, io): Promise<void> {
    const db: EventStore<IMessage> = await this.orbitdb.log<IMessage>(
      `direct.messages.${address}`,
      {
        accessController: {
          write: ['*']
        }
      }
    )

      console.log(`WAGGLE_STORAGE: initializeConversation ${address}`)

    this.directMessagesRepos.set(address, { db, eventsAttached: false })
    await this.messageThreads.put(address, encryptedPhrase)
    this.subscribeForDirectMessageThread(address, io)
  }

  public async subscribeForDirectMessageThread(channelAddress, io) {
    console.log('Subscribing to channel ', channelAddress)
    let db: EventStore<IMessage>
    let repo = this.directMessagesRepos.get(channelAddress)

    if (repo) {
      db = repo.db
    } else {
      db = await this.createDirectMessageThread(channelAddress)
      if (!db) {
        console.log(`Can't subscribe to channel ${channelAddress}`)
        return
      }
      repo = this.repos.get(channelAddress)
    }

    if (repo && !repo.eventsAttached) {
      console.log('Subscribing to channel ', channelAddress)
      db.events.on('write', (_address, entry) => {
        console.log('Writing to messages db')
        socketDirectMessage(io, { message: entry.payload.value, channelAddress })
      })
      db.events.on('replicated', () => {
        console.log('Message replicated')
        loadAllDirectMessages(io, this.getAllChannelMessages(db), channelAddress)
      })
      repo.eventsAttached = true
      loadAllMessages(io, this.getAllChannelMessages(db), channelAddress)
      console.log('Subscription to channel ready', channelAddress)
    }
  }

  private async createDirectMessageThread(
    channelAddress: string
  ): Promise<EventStore<IMessage>> {
    if (!channelAddress) {
      console.log('No channel address, can\'t create channel')
      return
    }

    const db: EventStore<IMessage> = await this.orbitdb.log<IMessage>(
      `zbay.channels.${channelAddress}`,
      {
        accessController: {
          write: ['*']
        }
      }
    )
    await db.load()

    const channel = this.messageThreads.get(channelAddress)
    if (!channel) {
      await this.messageThreads.put(channelAddress, `/orbitdb/${db.address.root}/${db.address.path}`
      )
    }
    this.repos.set(channelAddress, { db, eventsAttached: false })
    return db
  }

  public async getAvailableUsers(io?): Promise<any> {
    await this.directMessages.load()
    const payload = this.directMessages.all
    io.emit(EventTypesResponse.RESPONSE_GET_AVAILABLE_USERS, payload)
  }

  public async getPrivateConversations(io): Promise<void> {
    await this.messageThreads.load()
    const payload = this.messageThreads.all
    io.emit(EventTypesResponse.RESPONSE_GET_PRIVATE_CONVERSATIONS, payload)
  }

  public async sendDirectMessage(channelAddress: string, io: any, message: IMessage) {
    console.log(`STORAGE: sendDirectMessage channelAddress is ${channelAddress}`)
    console.log(`STORAGE: sendDirectMessage message is ${message}`)
    const db = this.directMessagesRepos.get(channelAddress).db
    await db.add(message)
  }
}
