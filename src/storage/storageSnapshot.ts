import { createPaths } from '../utils'
import OrbitDB from 'orbit-db'
import EventStore from 'orbit-db-eventstore'
import PeerId from 'peer-id'
import { StorageOptions } from '../common/types'
import { Storage } from '../storage'

import { CID } from 'multiformats/cid'
const Log = require('ipfs-log')
const Entry = Log.Entry
import debug from 'debug'
import fs from 'fs'
const log = Object.assign(debug('waggle:db'), {
  error: debug('waggle:db:err')
})
const logSync = Object.assign(debug('logSync'), {
  error: debug('logSync:err')
})

interface SnapshotInfo {
  queuePath: string,
  snapshotPath: string,
  mode: number,
  hash: string,
  size: number,
  unfinished: Array<any>
}

export class StorageTestSnapshot extends Storage {
  public messages: EventStore<string>
  public startedReplication: boolean
  public messagesCount: number
  public snapshotInfoDb: EventStore<SnapshotInfo>
  public useSnapshot: boolean

  constructor(zbayDir: string, io: any, options?: Partial<StorageOptions>) {
    super(zbayDir, io, options)
    this.startedReplication = false
    this.useSnapshot = options.useSnapshot || process.env.USE_SNAPSHOT === "true"  // Actually use snapshot mechanizm
    console.log('useSnapshot', this.useSnapshot)
    this.messagesCount = 1000  // Quantity of messages that will be added to db
  }

  public async init(libp2p: any, peerID: PeerId): Promise<void> {
    logSync('StorageTest: Entered init')
    if (this.options?.createPaths) {
      createPaths([this.ipfsRepoPath, this.orbitDbDir])
    }
    this.ipfs = await this.initIPFS(libp2p, peerID)

    this.orbitdb = await OrbitDB.createInstance(this.ipfs, { directory: this.orbitDbDir })
    this.snapshotInfoDb = await this.orbitdb.log<SnapshotInfo>('092183012', {
      accessController: {
        write: ['*']
      },
    })
    this.snapshotInfoDb.events.on('replicated', async () => {
      if (!this.useSnapshot) return

      // Retrieve snapshot that someone else saved to db
      if (!this.options.createSnapshot || process.env.CREATE_SNAPSHOT !== "true") {
        logSync('Replicated snapshotInfoDb')
        await this.saveRemoteSnapshot(this.messages)
        console.time('load from snapshot')
        await this.loadFromSnapshot(this.messages)
        console.timeEnd('load from snapshot')
      }
    })
    this.snapshotInfoDb.events.on('replicate.progress', (address, hash, entry, progress, total) => {
      logSync('replication in progress:', address, hash, entry, progress, total)
      logSync('>>', entry.payload.value.snapshot)
    })
    await this.createDbForMessages()
  }

  private async createDbForMessages() {
    logSync('createDbForMessages init')
    this.messages = await this.orbitdb.log<string>('3479623913-test', {
      accessController: {
        write: ['*']
      }
    })

    // Create snapshot and save to db for other peers to retrieve
    if (this.options.createSnapshot || process.env.CREATE_SNAPSHOT === "true") {
      console.log('Before adding messages')
      console.time('Adding messages')
      await this.addMessages()
      console.timeEnd('Adding messages')
      console.time('Loading messages')
      await this.messages.load()
      console.timeEnd('Loading messages')
      if (this.useSnapshot) {
        console.time('Saving Snapshot')
        await this.saveSnapshot(this.messages)
        console.timeEnd('Saving Snapshot')
      }
    }

    this.messages.events.on('replicated', async () => {
      this.msgReplCount += 1
      logSync(`Replicated ${this.msgReplCount} chunk`)
      // await this.messages.load()
      // console.log('Loaded entries after replication:', this.getAllEventLogEntries(this.messages).length)
    })

    this.messages.events.on('replicate.progress', async (address, hash, entry, progress, total) => {
      if (!this.startedReplication) {
        console.time('Replication time')
        this.startedReplication = true
        console.log('progress start', progress)
      }
      // console.log('---')
      // console.log(`replicate.progress: ${address}`)
      // console.log(`replicate.progress: ${hash}`)
      // console.log(`replicate.progress: ${entry.payload.value}`)
      // console.log(`replicate.progress: ${progress}`)
      // console.log(`replicate.progress: ${total}`)
      // await this.messages.load()
      // console.log('Loaded entries replicate.progress:', this.getAllEventLogEntries(this.messages).length)
      // fs.writeFileSync('allReplicatedMessages.json', JSON.stringify(this.getAllEventLogEntries(this.messages)))
      if (progress === this.messagesCount) {
        console.timeEnd('Replication time')
      }
    })

    await this.messages.load()
    console.log('Loaded entries:', this.getAllEventLogEntries(this.messages).length)
  }

  private async addMessages() {  // Generate and add "messages" to db
    let range = n => Array.from(Array(n).keys())
    for (const nr of range(this.messagesCount)) {
      // console.time(`adding msg ${nr.toString()}`)
      await this.messages.add(`message_${nr.toString()}`)
      // console.timeEnd(`adding msg ${nr.toString()}`)
    }
  }

  public async saveRemoteSnapshot(db) {  // Save retrieved snapshot info to local cache
    if (this.snapshotSaved) {
      return
    }
    console.log('Saving remote snapshot locally')
    const snapshotData = this.getSnapshotFromDb()

    //// @ts-expect-error
    await db._cache.set(snapshotData.snapshotPath, snapshotData.snapshot)
    //// @ts-expect-error
    await db._cache.set(snapshotData.queuePath, snapshotData.unfinished)
    this.snapshotSaved = true
  }

  async saveSnapshotInfoToDb(queuePath, snapshotPath, snapshot, unfinished) {
    logSync('Saving snapshot info to DB')
    await this.snapshotInfoDb.add({
      queuePath,
      snapshotPath,
      mode: snapshot.mode,
      hash: snapshot.hash,
      size: snapshot.size,
      unfinished
    })
    logSync('Saved snapshot info to DB')
  }

  public getSnapshotFromDb() {
    const snapshotInfo: SnapshotInfo = this.getAllEventLogEntries(this.snapshotInfoDb)[0] // Assume that at this point we replicated snapshot info
    console.log('snapshot retrieved', snapshotInfo)
    const cidObj = CID.parse(snapshotInfo.hash)
    console.log('CID', cidObj)
    const snapshot = {
      path: snapshotInfo.hash,
      cid: cidObj,
      size: snapshotInfo.size,
      mode: snapshotInfo.mode,
      mtime: undefined,
      hash: snapshotInfo.hash
    }
    return {
      queuePath: snapshotInfo.queuePath,
      snapshotPath: snapshotInfo.snapshotPath,
      snapshot,
      unfinished: snapshotInfo.unfinished
    }
  }

  async saveSnapshot(db) {  // Copied from orbit-db-store
    const unfinished = db._replicator.getQueue()

    const snapshotData = db._oplog.toSnapshot()
    const buf = Buffer.from(JSON.stringify({
      id: snapshotData.id,
      heads: snapshotData.heads,
      size: snapshotData.values.length,
      values: snapshotData.values,
      type: db.type
    }))

    const snapshot = await db._ipfs.add(buf)

    snapshot.hash = snapshot.cid.toString() // js-ipfs >= 0.41, ipfs.add results contain a cid property (a CID instance) instead of a string hash property
    await db._cache.set(db.snapshotPath, snapshot)
    await db._cache.set(db.queuePath, unfinished)

    console.debug(`Saved snapshot: ${snapshot.hash}, queue length: ${unfinished.length}`)
    await this.saveSnapshotInfoToDb(
      db.queuePath,
      db.snapshotPath,
      snapshot,
      unfinished
    )
    return [snapshot]
  }

  async loadFromSnapshot(db) { // Copied from orbit-db-store
    if (db.options.onLoad) {
      await db.options.onLoad(db)
    }

    db.events.emit('load', db.address.toString()) // TODO emits inconsistent params, missing heads param

    const maxClock = (res, val) => Math.max(res, val.clock.time)

    const queue = await db._cache.get(db.queuePath)
    db.sync(queue || [])

    const snapshot = await db._cache.get(db.snapshotPath)

    if (snapshot) {
      const chunks = []
      for await (const chunk of db._ipfs.cat(snapshot.hash)) {
        chunks.push(chunk)
      }
      const buffer = Buffer.concat(chunks)
      const snapshotData = JSON.parse(buffer.toString())
      fs.writeFileSync(`loadedSnapshotData${new Date().toISOString()}.json`, buffer.toString()) // Saving snapshot to investigate it later

      const onProgress = (hash, entry, count, total) => {
        db._recalculateReplicationStatus(count, entry.clock.time)
        db._onLoadProgress(hash, entry)
      }

      // Fetch the entries
      // Timeout 1 sec to only load entries that are already fetched (in order to not get stuck at loading)
      db._recalculateReplicationMax(snapshotData.values.reduce(maxClock, 0))
      if (snapshotData) {
        const log = await Log.fromJSON(db._ipfs, db.identity, snapshotData, { access: db.access, sortFn: db.options.sortFn, length: -1, timeout: 1000, onProgressCallback: onProgress })
        await db._oplog.join(log)
        await db._updateIndex()
        db.events.emit('replicated', db.address.toString()) // TODO: inconsistent params, count param not emited
      }
      db.events.emit('ready', db.address.toString(), db._oplog.heads)
    } else {
      throw new Error(`Snapshot for ${db.address} not found!`)
    }

    return db
  }
}