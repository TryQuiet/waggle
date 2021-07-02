import IPFS from 'ipfs'
import path from 'path'
import { createPaths, getCertFieldValue } from '../utils'
import OrbitDB from 'orbit-db'
import KeyValueStore from 'orbit-db-kvstore'
import EventStore from 'orbit-db-eventstore'
import PeerId from 'peer-id'
import {
  message as socketMessage,
  loadAllMessages,
  loadAllDirectMessages,
  sendIdsToZbay
} from '../socket/events/messages'
import { EventTypesResponse } from '../socket/constantsReponse'
import { loadAllPublicChannels } from '../socket/events/channels'
import { Libp2p } from 'libp2p-gossipsub/src/interfaces'
import { Config, dataFromRootPems } from '../constants'
import { loadCertificates } from '../socket/events/certificates'
import { IRepo, StorageOptions, IChannelInfo, IMessage, ChannelInfoResponse, IZbayChannel, IPublicKey, IMessageThread, DataFromPems } from '../common/types'
import { verifyUserCert, parseCertificate } from '@zbayapp/identity'
import { CertFieldsTypes } from '@zbayapp/identity/lib/common'
import debug from 'debug'
const log = Object.assign(debug('waggle:db'), {
  error: debug('waggle:db:err')
})

export class Storage {
  public zbayDir: string
  public io: any
  public peerId: PeerId
  private ipfs: IPFS.IPFS
  private orbitdb: OrbitDB
  private channels: KeyValueStore<IZbayChannel>
  private directMessagesUsers: KeyValueStore<IPublicKey>
  private messageThreads: KeyValueStore<IMessageThread>
  private certificates: EventStore<string>
  public publicChannelsRepos: Map<String, IRepo> = new Map()
  public directMessagesRepos: Map<String, IRepo> = new Map()
  private publicChannelsEventsAttached: boolean = false
  public options: StorageOptions
  public orbitDbDir: string
  public ipfsRepoPath: string

  constructor(zbayDir: string, io: any, options?: Partial<StorageOptions>) {
    this.zbayDir = zbayDir
    this.io = io
    this.options = {
      ...new StorageOptions(),
      ...options
    }
    this.orbitDbDir = path.join(this.zbayDir, Config.ORBIT_DB_DIR)
    this.ipfsRepoPath = path.join(this.zbayDir, Config.IPFS_REPO_PATH)
  }

  public async init(libp2p: any, peerID: PeerId): Promise<void> {
    log('STORAGE: Entered init')
    if (this.options?.createPaths) {
      createPaths([this.ipfsRepoPath, this.orbitDbDir])
    }
    this.ipfs = await this.initIPFS(libp2p, peerID)

    this.orbitdb = await OrbitDB.createInstance(this.ipfs, { directory: this.orbitDbDir })
    log('1/6')
    await this.createDbForChannels()
    log('2/6')
    await this.createDbForCertificates()
    await this.createDbForUsers()
    log('3/6')
    await this.createDbForMessageThreads()
    log('4/6')
    await this.initAllChannels()
    log('5/6')
    await this.initAllConversations()
    log('6/6')
  }

  private async __stopOrbitDb() {
    if (this.orbitdb) {
      log('Stopping OrbitDB')
      await this.orbitdb.stop()
    }
  }

  private async __stopIPFS() {
    if (this.ipfs) {
      log('Stopping IPFS')
      await this.ipfs.stop()
    }
  }

  public async stopOrbitDb() {
    await this.__stopOrbitDb()
    await this.__stopIPFS()
  }

  protected async initIPFS(libp2p: Libp2p, peerID: PeerId): Promise<IPFS.IPFS> {
    return await IPFS.create({
      libp2p: () => libp2p,
      preload: { enabled: false },
      repo: this.ipfsRepoPath,
      EXPERIMENTAL: {
        ipnsPubsub: true
      },
      // @ts-expect-error - IPFS does not have privateKey in its Options type
      privateKey: peerID.toJSON().privKey
    })
  }

  public async createDbForCertificates() {
    log('createDbForCertificates init')
    this.certificates = await this.orbitdb.log<string>('certificates', {
      accessController: {
        write: ['*']
      }
    })

    this.certificates.events.on('replicated', () => {
      log('REPLICATED: Certificates')
      loadCertificates(this.io, this.getAllEventLogEntries(this.certificates))
    })
    this.certificates.events.on('write', (_address, entry) => {
      log('Saved certificate locally')
      log(entry.payload.value)
      loadCertificates(this.io, this.getAllEventLogEntries(this.certificates))
    })
    this.certificates.events.on('ready', () => {
      log('Loaded certificates to memory')
      loadCertificates(this.io, this.getAllEventLogEntries(this.certificates))
    })

    // @ts-expect-error - OrbitDB's type declaration of `load` lacks 'options'
    await this.certificates.load({ fetchEntryTimeout: 15000 })
    const allCertificates = this.getAllEventLogEntries(this.certificates)
    log('ALL Certificates COUNT:', allCertificates.length)
    log('ALL Certificates:', allCertificates)
    log('STORAGE: Finished createDbForCertificates')
  }

  private async createDbForChannels() {
    log('createDbForChannels init')
    this.channels = await this.orbitdb.keyvalue<IZbayChannel>('public-channels', {
      accessController: {
        write: ['*']
      }
    })

    this.channels.events.on('replicated', () => {
      log('REPLICATED: CHANNELS')
    })

    // @ts-expect-error - OrbitDB's type declaration of `load` lacks 'options'
    await this.channels.load({ fetchEntryTimeout: 15000 })
    log('ALL CHANNELS COUNT:', Object.keys(this.channels.all).length)
    log('ALL CHANNELS COUNT:', Object.keys(this.channels.all))
    log('STORAGE: Finished createDbForChannels')
  }

  private async createDbForMessageThreads() {
    this.messageThreads = await this.orbitdb.keyvalue<IMessageThread>('msg-threads', {
      accessController: {
        write: ['*']
      }
    })
    this.messageThreads.events.on(
      'replicated',
      // eslint-disable-next-line
      async () => {
        // @ts-expect-error - OrbitDB's type declaration of `load` lacks 'options'
        await this.messageThreads.load({ fetchEntryTimeout: 2000 })
        const payload = this.messageThreads.all
        this.io.emit(EventTypesResponse.RESPONSE_GET_PRIVATE_CONVERSATIONS, payload)
        await this.initAllConversations()
      }
    )
    // @ts-expect-error - OrbitDB's type declaration of `load` lacks 'options'
    await this.messageThreads.load({ fetchEntryTimeout: 2000 })
    log('ALL MESSAGE THREADS COUNT:', Object.keys(this.messageThreads.all).length)
  }

  private async createDbForUsers() {
    this.directMessagesUsers = await this.orbitdb.keyvalue<IPublicKey>('dms', {
      accessController: {
        write: ['*']
      }
    })

    this.directMessagesUsers.events.on(
      'replicated',
      // eslint-disable-next-line
      async () => {
        // @ts-expect-error - OrbitDB's type declaration of `load` lacks 'options'
        await this.directMessagesUsers.load({ fetchEntryTimeout: 2000 })
        // await this.directMessagesUsers.close()
        const payload = this.directMessagesUsers.all
        this.io.emit(EventTypesResponse.RESPONSE_GET_AVAILABLE_USERS, payload)
        log('REPLICATED USERS')
      }
    )
    try {
      // @ts-expect-error - OrbitDB's type declaration of `load` lacks 'options'
      await this.directMessagesUsers.load({ fetchEntryTimeout: 2000 })
    } catch (err) {
      log.error(err)
    }
    log('ALL USERS COUNT:', Object.keys(this.directMessagesUsers.all).length)
  }

  async initAllChannels() {
    console.time('initAllChannels')
    await Promise.all(
      Object.values(this.channels.all).map(async channel => {
        if (!this.publicChannelsRepos.has(channel.address)) {
          await this.createChannel(channel.address, channel)
        }
      })
    )
    console.timeEnd('initAllChannels')
  }

  async initAllConversations() {
    console.time('initAllConversations')
    await Promise.all(
      Object.keys(this.messageThreads.all).map(async conversation => {
        if (!this.directMessagesRepos.has(conversation)) {
          await this.createDirectMessageThread(conversation)
        }
      })
    )
    console.timeEnd('initAllConversations')
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

  private getAllEventLogEntries(db: EventStore<any>): any[] {
    // TODO: fix typing
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
    loadAllMessages(this.io, this.getAllEventLogEntries(db), channelAddress)
  }

  public async subscribeForChannel(
    channelAddress: string,
    channelInfo?: IChannelInfo
  ): Promise<void> {
    let db: EventStore<IMessage>
    let repo = this.publicChannelsRepos.get(channelAddress)

    if (repo) {
      db = repo.db
    } else {
      db = await this.createChannel(channelAddress, channelInfo)
      if (!db) {
        log(`Can't subscribe to channel ${channelAddress}`)
        return
      }
      repo = this.publicChannelsRepos.get(channelAddress)
    }

    if (repo && !repo.eventsAttached) {
      log('Subscribing to channel ', channelAddress)
      if (!this.options.isWaggleMobileMode) {
        db.events.on('write', (_address, entry) => {
          log(`Writing to public channel db ${channelAddress}`)
          socketMessage(this.io, { message: entry.payload.value, channelAddress })
        })
        db.events.on('replicated', () => {
          const ids = this.getAllEventLogEntries(db).map(msg => msg.id)
          console.log('Message replicated')
          sendIdsToZbay(this.io, ids, channelAddress)
        })
        db.events.on('ready', () => {
          const ids = this.getAllEventLogEntries(db).map(msg => msg.id)
          sendIdsToZbay(this.io, ids, channelAddress)
        })
        repo.eventsAttached = true
        const ids = this.getAllEventLogEntries(db).map(msg => msg.id)
        sendIdsToZbay(this.io, ids, channelAddress)
      } else {
        db.events.on('write', (_address, entry) => {
          log(`Writing to messages db ${channelAddress}`)
          log(entry.payload.value)
          socketMessage(this.io, { message: entry.payload.value, channelAddress })
        })
        db.events.on('replicated', () => {
          log('Message replicated')
          loadAllMessages(this.io, this.getAllEventLogEntries(db), channelAddress)
        })
        repo.eventsAttached = true
        loadAllMessages(this.io, this.getAllEventLogEntries(db), channelAddress)
        log('Subscription to channel ready', channelAddress)
      }
    }
  }

  public async askForMessages(channelAddress: string, ids: string[]) {
    const repo = this.publicChannelsRepos.get(channelAddress)
    if (!repo) return
    const messages = this.getAllEventLogEntries(repo.db)
    const filteredMessages = []
    // eslint-disable-next-line
    for (let id of ids) {
      filteredMessages.push(...messages.filter(i => i.id === id))
    }
    loadAllMessages(this.io, filteredMessages, channelAddress)
  }

  public async sendMessage(channelAddress: string, message: IMessage) {
    await this.subscribeForChannel(channelAddress) // Is it necessary?
    const db = this.publicChannelsRepos.get(channelAddress).db
    await db.add(message)
  }

  private async createChannel(
    channelAddress: string,
    channelData?: IChannelInfo
  ): Promise<EventStore<IMessage>> {
    if (!channelAddress) {
      log("No channel address, can't create channel")
      return
    }
    const db: EventStore<IMessage> = await this.orbitdb.log<IMessage>(
      `channels.${channelAddress}`,
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
      log(`Created channel ${channelAddress}`)
    }
    this.publicChannelsRepos.set(channelAddress, { db, eventsAttached: false })
    // @ts-expect-error - OrbitDB's type declaration of `load` lacks 'options'
    await db.load({ fetchEntryTimeout: 2000 })
    return db
  }

  public async addUser(address: string, halfKey: string): Promise<void> {
    await this.directMessagesUsers.put(address, { halfKey })
    // @ts-expect-error - OrbitDB's type declaration of `load` lacks 'options'
    await this.directMessagesUsers.load({ fetchEntryTimeout: 2000 })
    const payload = this.directMessagesUsers.all
    this.io.emit(EventTypesResponse.RESPONSE_GET_AVAILABLE_USERS, payload)
  }

  public async initializeConversation(address: string, encryptedPhrase: string): Promise<void> {
    const db: EventStore<IMessage> = await this.orbitdb.log<IMessage>(`dms.${address}`, {
      accessController: {
        write: ['*']
      }
    })

    this.directMessagesRepos.set(address, { db, eventsAttached: false })
    await this.messageThreads.put(address, encryptedPhrase)
    await this.subscribeForDirectMessageThread(address)
  }

  public async subscribeForAllConversations(conversations) {
    console.time('subscribeForAllConversations')
    await Promise.all(
      conversations.map(async channel => {
        await this.subscribeForDirectMessageThread(channel)
      })
    )
    console.timeEnd('subscribeForAllConversations')
  }

  public async subscribeForDirectMessageThread(channelAddress: string) {
    let db: EventStore<IMessage>
    let repo = this.directMessagesRepos.get(channelAddress)

    if (repo) {
      db = repo.db
    } else {
      db = await this.createDirectMessageThread(channelAddress)
      if (!db) {
        log(`Can't subscribe to direct messages thread ${channelAddress}`)
        return
      }
      repo = this.directMessagesRepos.get(channelAddress)
    }

    if (repo && !repo.eventsAttached) {
      log('Subscribing to direct messages thread ', channelAddress)
      loadAllDirectMessages(this.io, this.getAllEventLogEntries(db), channelAddress)
      db.events.on('write', (_address, _entry) => {
        log('Writing')
        loadAllDirectMessages(this.io, this.getAllEventLogEntries(db), channelAddress)
      })
      db.events.on('replicated', () => {
        log('Message replicated')
        loadAllDirectMessages(this.io, this.getAllEventLogEntries(db), channelAddress)
      })
      db.events.on('ready', () => {
        log('DIRECT Messages thread ready')
      })
      repo.eventsAttached = true
      loadAllMessages(this.io, this.getAllEventLogEntries(db), channelAddress)
      log('Subscription to channel ready', channelAddress)
    }
  }

  private async createDirectMessageThread(channelAddress: string): Promise<EventStore<IMessage>> {
    if (!channelAddress) {
      log("No channel address, can't create channel")
      return
    }

    log(`creatin direct message thread for ${channelAddress}`)

    const db: EventStore<IMessage> = await this.orbitdb.log<IMessage>(
      `dms.${channelAddress}`,
      {
        accessController: {
          write: ['*']
        }
      }
    )
    db.events.on('replicated', () => {
      log('replicated some messages')
    })
    // @ts-expect-error - OrbitDB's type declaration of `load` lacks 'options'
    await db.load({ fetchEntryTimeout: 2000 })

    this.directMessagesRepos.set(channelAddress, { db, eventsAttached: false })
    return db
  }

  public async sendDirectMessage(channelAddress: string, message: string) {
    await this.subscribeForDirectMessageThread(channelAddress) // Is it necessary? Yes it is atm
    log('STORAGE: sendDirectMessage entered')
    log(`STORAGE: sendDirectMessage channelAddress is ${channelAddress}`)
    log(`STORAGE: sendDirectMessage message is ${JSON.stringify(message)}`)
    const db = this.directMessagesRepos.get(channelAddress).db
    log(`STORAGE: sendDirectMessage db is ${db.address.root}`)
    log(`STORAGE: sendDirectMessage db is ${db.address.path}`)
    await db.add(message)
  }

  public async getAvailableUsers(): Promise<any> {
    log('STORAGE: getAvailableUsers entered')
    // @ts-expect-error - OrbitDB's type declaration of `load` lacks 'options'
    await this.directMessagesUsers.load({ fetchEntryTimeout: 2000 })
    const payload = this.directMessagesUsers.all
    this.io.emit(EventTypesResponse.RESPONSE_GET_AVAILABLE_USERS, payload)
    log('emitted')
  }

  public async getPrivateConversations(): Promise<void> {
    log('STORAGE: getPrivateConversations enetered')
    // @ts-expect-error - OrbitDB's type declaration of `load` arguments lacks 'options'
    await this.messageThreads.load({ fetchEntryTimeout: 2000 })
    const payload = this.messageThreads.all
    log('STORAGE: getPrivateConversations payload payload')
    this.io.emit(EventTypesResponse.RESPONSE_GET_PRIVATE_CONVERSATIONS, payload)
  }

  public async saveCertificate(certificate: string, fromRootPems?: DataFromPems): Promise<boolean> {
    const rootPems = fromRootPems || dataFromRootPems  // TODO: tmp for backward compatibilty
    log('About to save certificate...')
    if (!certificate) {
      log('Certificate is either null or undefined, not saving to db')
      return false
    }
    const verification = await verifyUserCert(rootPems.certificate, certificate)
    if (verification.resultCode !== 0) {
      log.error('Certificate is not valid')
      log.error(verification.resultMessage)
      return false
    }
    log('Saving certificate...')
    await this.certificates.add(certificate)
    return true
  }

  public usernameExists(username: string): boolean {
    /**
     * Check if given username is already in use
     */
    const certificates = this.getAllEventLogEntries(this.certificates)
    for (const cert of certificates) {
      const parsedCert = parseCertificate(cert)
      const certUsername = getCertFieldValue(parsedCert, CertFieldsTypes.nickName)
      if (certUsername.localeCompare(username, undefined, {sensitivity: 'base'}) === 0) {
        return true
      }
    }
    return false
  }
}
