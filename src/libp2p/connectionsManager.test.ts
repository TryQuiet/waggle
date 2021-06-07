import { ConnectionsManager } from './connectionsManager'
import { DataServer } from '../socket/DataServer'
import { Config } from '../constants'
import { Tor } from '../torManager/index'
import { getPorts } from '../utils'
import PeerId from 'peer-id'
import path from 'path'
import os from 'os'
import tmp from 'tmp'
import fs from 'fs'
import { createMinConnectionManager } from '../testUtils'
const utils = require('../utils')
tmp.setGracefulCleanup()
jest.setTimeout(150_000)

let tmpDir;
let tmpappDataPath;
let tmpPeerIdPath;

beforeEach(() => {
  jest.clearAllMocks()
  tmpDir = tmp.dirSync({ mode: 0o750, prefix: 'zbayTestTmp_' , unsafeCleanup: true})
  tmpappDataPath = path.join(tmpDir.name, Config.ZBAY_DIR)
  tmpPeerIdPath = path.join(tmpappDataPath, Config.PEER_ID_FILENAME)
})

afterEach(() => {
  tmpDir.removeCallback()
})

test('start and close connectionsManager', async () => {
  const ports = await getPorts()
  const torPath = `${process.cwd()}/tor/tor`
  const pathDevLib = path.join.apply(null, [process.cwd(), 'tor'])
  const dataServer = new DataServer(ports.dataServer)
  await dataServer.listen()
  const tor = new Tor({
    socksPort: ports.socksPort,
    torPath,
    appDataPath: tmpappDataPath,
    controlPort: 9051,
    options: {
      env: {
        LD_LIBRARY_PATH: pathDevLib,
        HOME: os.homedir()
      },
      detached: true
    }
  })
  await tor.init()
  const service1 = await tor.createNewHiddenService(9799, 9799)

  const connectionsManager = new ConnectionsManager({
    port: ports.libp2pHiddenService,
    host: `${service1.onionAddress}.onion`,
    agentHost: 'localhost',
    agentPort: ports.socksPort,
    io: dataServer.io,
    options: {
      env: {
        appDataPath: tmpappDataPath
      }
    }
  })

  await connectionsManager.initializeNode()
  await connectionsManager.initStorage()
  await connectionsManager.closeStorage()
  await connectionsManager.stopLibp2p()
  await dataServer.close()
  await tor.kill()
})

test('Create new peerId and save its key to a file', async () => {
  const connectionsManager = createMinConnectionManager({
    env: {
      appDataPath: tmpappDataPath
    }
  })
  expect(fs.existsSync(tmpPeerIdPath)).toBe(false)
  jest.spyOn(connectionsManager, 'initLibp2p').mockImplementation(() => {return null})
  await connectionsManager.initializeNode()
  expect(fs.existsSync(tmpPeerIdPath)).toBe(true)
})

test('Read peer from a file', async () => {
  fs.mkdirSync(tmpappDataPath)
  const peerId = await PeerId.create()
  fs.writeFileSync(tmpPeerIdPath, peerId.toJSON().privKey)
  const connectionsManager = createMinConnectionManager({
    env: {
      appDataPath: tmpappDataPath
    }
  })
  jest.spyOn(connectionsManager, 'initLibp2p').mockImplementation(() => {return null})
  const result = await connectionsManager.initializeNode()
  expect(result.peerId).toBe(peerId.toB58String())
})

test('Paths should be created by default', async () => {
  const connectionsManager = createMinConnectionManager({
    env: {
      appDataPath: tmpappDataPath
    }
  })
  const createPathsSpy = jest.spyOn(utils, 'createPaths')
  const libp2pMock = jest.spyOn(connectionsManager, 'initLibp2p').mockImplementation(() => {return null})
  await connectionsManager.initializeNode()
  expect(libp2pMock).toHaveBeenCalled()
  expect(createPathsSpy).toHaveBeenCalled()
})

test('Do not try to create paths if createPaths option is set to false', async () => {
  fs.mkdirSync(tmpappDataPath) // Assuming app data path exists
  const connectionsManager = createMinConnectionManager({
    env: {
      appDataPath: tmpappDataPath
    },
    createPaths: false
  })
  const createPathsSpy = jest.spyOn(utils, 'createPaths')
  const libp2pMock = jest.spyOn(connectionsManager, 'initLibp2p').mockImplementation(() => {return null})
  await connectionsManager.initializeNode()
  expect(libp2pMock).toHaveBeenCalled()
  expect(createPathsSpy).not.toHaveBeenCalled()
})
