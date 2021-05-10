import IPFS from 'ipfs'
import path from 'path'
import { createPaths } from '../utils'
import OrbitDB from 'orbit-db'
import KeyValueStore from 'orbit-db-kvstore'
import EventStore from 'orbit-db-eventstore'
import PeerId from 'peer-id'
import { message as socketMessage, directMessage as socketDirectMessage, directMessage } from '../socket/events/message'
import { loadAllMessages, loadAllDirectMessages } from '../socket/events/allMessages'
import { EventTypesResponse } from '../socket/constantsReponse'
import fs from 'fs'
import { loadAllPublicChannels } from '../socket/events/channels'

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

export interface ChannelInfoResponse {
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
  zbayDir: string
  io: any
  constructor(zbayDir: string, io: any) {
    this.zbayDir = zbayDir
    this.io = io
  }

  private ipfs: IPFS.IPFS
  private orbitdb: OrbitDB
  private channels: KeyValueStore<IZbayChannel>
  private directMessagesUsers: KeyValueStore<IPublicKey>
  private messageThreads: KeyValueStore<IMessageThread>
  public publicChannelsRepos: Map<String, IRepo> = new Map()
  public directMessagesRepos: Map<String, IRepo> = new Map()
  private publicChannelsEventsAttached: boolean = false

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
    console.log('1')
    await this.createDbForChannels()
    console.log('2')
    await this.createDbForDirectMessages()
    console.log('3')
    await this.createDbForMessageThreads()
    console.log('4')
    await this.initAllChannels()
    console.log('5')
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
    console.log('creating channels count')
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
    console.log('try to create db for messages')
    this.messageThreads = await this.orbitdb.keyvalue<IMessageThread>('message-threads', {
      accessController: {
        write: ['*']
      }
    })
    this.messageThreads.events.on('replicated', async () => {
      console.log('REPLICATED CONVERSATIONS-ID')
      await this.messageThreads.load()
      const payload = this.messageThreads.all
      this.io.emit(EventTypesResponse.RESPONSE_GET_PRIVATE_CONVERSATIONS, payload)
      //this.subscribeForAllDirectMessagesThreads()
    })
    await this.messageThreads.load()
    console.log('ALL MESSAGE THREADS COUNT:', Object.keys(this.messageThreads.all).length)
    console.log('ALL MESSAGE THREADS COUNT:', Object.keys(this.messageThreads.all))
  }

  private async createDbForDirectMessages() {
    this.directMessagesUsers = await this.orbitdb.keyvalue<IPublicKey>('direct-messages', {
      accessController: {
        write: ['*']
      }
    })
    console.log('created or initialized database')
    this.directMessagesUsers.events.on('replicated', async () => {
      console.log('started replicating')
      console.log('before loading database')
      await this.directMessagesUsers.load()
      console.log('after loading database')
      const payload = this.directMessagesUsers.all
      console.log('paylaod is loaded')
      this.io.emit(EventTypesResponse.RESPONSE_GET_AVAILABLE_USERS, payload)
      console.log('REPLICATED USERS')
    })
    console.log('before loading database')
    try {
      await this.directMessagesUsers.load()
    } catch (err) {
      console.log(err)
    }
    console.log('after laoding database')
    console.log('ALL USERS COUNT:', Object.keys(this.directMessagesUsers.all).length)
    console.log('ALL USERS COUNT:', Object.keys(this.directMessagesUsers.all))
  }

  async initAllChannels() {
    console.time(`initAllChannels`)
    await Promise.all(Object.values(this.channels.all).map(async channel => {
      if (!this.publicChannelsRepos.has(channel.address)) {
        await this.createChannel(channel.address, channel)
      }
    }))
    console.timeEnd(`initAllChannels`)
  }

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

  public async updateChannels() {
    /** Update list of available public channels */
    if (!this.publicChannelsEventsAttached) {
      this.channels.events.on('replicated', () => {
        loadAllPublicChannels(this.io, this.getChannelsResponse())
      })
      this.channels.events.on('ready', () => {
        loadAllPublicChannels(this.io, this.getChannelsResponse())
      })
      this.publicChannelsEventsAttached = true
    }
    loadAllPublicChannels(this.io, this.getChannelsResponse())
  }

  private getAllChannelMessages(db: EventStore<IMessage>): IMessage[] {
    // TODO: move to e.g custom Store
    return db
      .iterator({ limit: -1 })
      .collect()
      .map(e => e.payload.value)
  }

  public loadAllChannelMessages(channelAddress: string) {
    // Load all channel messages for subscribed channel
    if (!this.publicChannelsRepos.has(channelAddress)) {
      return
    }
    const db: EventStore<IMessage> = this.publicChannelsRepos.get(channelAddress).db
    loadAllMessages(this.io, this.getAllChannelMessages(db), channelAddress)
  }

  public async subscribeForChannel(channelAddress: string, channelInfo?: IChannelInfo): Promise<void> {
    let db: EventStore<IMessage>
    let repo = this.publicChannelsRepos.get(channelAddress)

    if (repo) {
      db = repo.db
    } else {
      db = await this.createChannel(channelAddress, channelInfo)
      if (!db) {
        console.log(`Can't subscribe to channel ${channelAddress}`)
        return
      }
      repo = this.publicChannelsRepos.get(channelAddress)
    }

    if (repo && !repo.eventsAttached) {
      console.log('Subscribing to channel ', channelAddress)
      db.events.on('write', (_address, entry) => {
        console.log('Writing to messages db')
        console.log(entry.payload.value)
        socketMessage(this.io, { message: entry.payload.value, channelAddress })
      })
      db.events.on('replicated', () => {
        console.log('Message replicated')
        loadAllMessages(this.io, this.getAllChannelMessages(db), channelAddress)
      })
      db.events.on('ready', () => {
        loadAllMessages(this.io, this.getAllChannelMessages(db), channelAddress)
      })
      repo.eventsAttached = true
      loadAllMessages(this.io, this.getAllChannelMessages(db), channelAddress)
      console.log('Subscription to channel ready', channelAddress)
    }
  }

  public async sendMessage(channelAddress: string, message: IMessage) {
    await this.subscribeForChannel(channelAddress, this.io) // Is it necessary?
    const db = this.publicChannelsRepos.get(channelAddress).db
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

    const channel = this.channels.get(channelAddress)
    if (!channel) {
      await this.channels.put(channelAddress, {
        orbitAddress: `/orbitdb/${db.address.root}/${db.address.path}`,
        address: channelAddress,
        ...channelData
      })
      console.log(`Created channel ${channelAddress}`)
    }
    this.publicChannelsRepos.set(channelAddress, { db, eventsAttached: false })
    await db.load()
    return db
  }

  public async addUser(address: string, halfKey: string): Promise<void> {
    await this.directMessagesUsers.put(address, { halfKey })
    await this.getAvailableUsers()

  }

  public async initializeConversation(address: string, encryptedPhrase: string): Promise<void> {
    const db: EventStore<IMessage> = await this.orbitdb.log<IMessage>(
      `direct.messages.${address}`,
      {
        accessController: {
          write: ['*']
        }
      }
    )

      console.log(`WAGGLE_STORAGE: initializeConversation ${address}`)
      console.log(`encrypted phrase is ${encryptedPhrase}`)

    this.directMessagesRepos.set(address, { db, eventsAttached: false })
    await this.messageThreads.put(address, encryptedPhrase)
    this.subscribeForDirectMessageThread(address)
  }

  // private async subscribeForAllDirectMessagesThreads() {
  //   for (const [key, value] of Object.entries(this.messageThreads.all)) {
  //     if (!this.directMessagesRepos.has(key)) {
  //       await this.subscribeForDirectMessageThread(key)
  //     }
  //   }
  // }

  public async subscribeForDirectMessageThread(channelAddress) {
    let db: EventStore<IMessage>
    let repo = this.directMessagesRepos.get(channelAddress)

    if (repo) {
      db = repo.db
    } else {
      db = await this.createDirectMessageThread(channelAddress)
      if (!db) {
        console.log(`Can't subscribe to direct messages thread ${channelAddress}`)
        return
      }
      repo = this.directMessagesRepos.get(channelAddress)
    }

    if (repo && !repo.eventsAttached) {
      console.log('Subscribing to direct messages thread ', channelAddress)
      loadAllDirectMessages(this.io, this.getAllChannelMessages(db), channelAddress)
      db.events.on('write', (_address, entry) => {
        console.log('Writing')
        socketDirectMessage(this.io, { message: entry.payload.value, channelAddress })
      })
      db.events.on('replicated', () => {
        console.log('Message replicated')
        loadAllDirectMessages(this.io, this.getAllChannelMessages(db), channelAddress)
      })
      db.events.on('ready', () => {
        console.log('DIRECT Messages thread ready')
      })
      repo.eventsAttached = true
      loadAllMessages(this.io, this.getAllChannelMessages(db), channelAddress)
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
      `direct.messages.${channelAddress}`,
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
    this.directMessagesRepos.set(channelAddress, { db, eventsAttached: false })
    return db
  }


  public async sendDirectMessage(channelAddress: string, message) {
    await this.subscribeForDirectMessageThread(channelAddress) // Is it necessary? Yes it is atm
    console.log(`STORAGE: sendDirectMessage entered`)
    console.log(`STORAGE: sendDirectMessage channelAddress is ${channelAddress}`)
    console.log(`STORAGE: sendDirectMessage message is ${JSON.stringify(message)}`)
    const db = this.directMessagesRepos.get(channelAddress).db
    console.log(`STORAGE: sendDirectMessage db is ${db.address.root}`)
    console.log(`STORAGE: sendDirectMessage db is ${db.address.path}`)
    await db.add(message)
    
  }
  public async getAvailableUsers(): Promise<any> {
    console.log(`STORAGE: getAvailableUsers entered`)
    await this.directMessagesUsers.load()
    const payload = this.directMessagesUsers.all
    console.log(`STORAGE: getAvailableUsers ${payload}`)
    this.io.emit(EventTypesResponse.RESPONSE_GET_AVAILABLE_USERS, payload)
  }

  public async getPrivateConversations(): Promise<void> {
    console.log('STORAGE: getPrivateConversations enetered')
    await this.messageThreads.load()
    const payload = this.messageThreads.all
    console.log(`STORAGE: getPrivateConversations payload payload`)
    this.io.emit(EventTypesResponse.RESPONSE_GET_PRIVATE_CONVERSATIONS, payload)
  }
}