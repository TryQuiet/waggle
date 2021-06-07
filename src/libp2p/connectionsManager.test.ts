import { ConnectionsManager } from './connectionsManager'
import { DataServer } from '../socket/DataServer'
import { Config } from '../constants'
import { Tor } from '../torManager/index'
import { getPorts } from '../utils'
import PeerId from 'peer-id'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { createMinConnectionManager, createTmpDir, TmpDir, tmpZbayDirPath } from '../testUtils'
const utils = require('../utils')
jest.setTimeout(150_000)

let tmpDir: TmpDir;
let tmpAppDataPath: string;
let tmpPeerIdPath: string;

beforeEach(() => {
  jest.clearAllMocks()
  tmpDir = createTmpDir()
  tmpAppDataPath = tmpZbayDirPath(tmpDir.name)
  tmpPeerIdPath = path.join(tmpAppDataPath, Config.PEER_ID_FILENAME)
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
    appDataPath: tmpAppDataPath,
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
        appDataPath: tmpAppDataPath
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
      appDataPath: tmpAppDataPath
    }
  })
  expect(fs.existsSync(tmpPeerIdPath)).toBe(false)
  jest.spyOn(connectionsManager, 'initLibp2p').mockImplementation(() => {return null})
  await connectionsManager.initializeNode()
  expect(fs.existsSync(tmpPeerIdPath)).toBe(true)
})

test('Read peer from a file', async () => {
  fs.mkdirSync(tmpAppDataPath)
  const peerId = await PeerId.create()
  fs.writeFileSync(tmpPeerIdPath, peerId.toJSON().privKey)
  const connectionsManager = createMinConnectionManager({
    env: {
      appDataPath: tmpAppDataPath
    }
  })
  jest.spyOn(connectionsManager, 'initLibp2p').mockImplementation(() => {return null})
  const result = await connectionsManager.initializeNode()
  expect(result.peerId).toBe(peerId.toB58String())
})

test('Paths should be created by default', async () => {
  const connectionsManager = createMinConnectionManager({
    env: {
      appDataPath: tmpAppDataPath
    }
  })
  const createPathsSpy = jest.spyOn(utils, 'createPaths')
  const libp2pMock = jest.spyOn(connectionsManager, 'initLibp2p').mockImplementation(() => {return null})
  await connectionsManager.initializeNode()
  expect(libp2pMock).toHaveBeenCalled()
  expect(createPathsSpy).toHaveBeenCalled()
})

test('Do not try to create paths if createPaths option is set to false', async () => {
  fs.mkdirSync(tmpAppDataPath) // Assuming app data path exists
  const connectionsManager = createMinConnectionManager({
    env: {
      appDataPath: tmpAppDataPath
    },
    createPaths: false
  })
  const createPathsSpy = jest.spyOn(utils, 'createPaths')
  const libp2pMock = jest.spyOn(connectionsManager, 'initLibp2p').mockImplementation(() => {return null})
  await connectionsManager.initializeNode()
  expect(libp2pMock).toHaveBeenCalled()
  expect(createPathsSpy).not.toHaveBeenCalled()
})
