import { ConnectionsManager } from './connectionsManager'
import { DummyIOServer, getPorts } from '../utils'
import { createTmpDir, TmpDir, tmpZbayDirPath } from '../testUtils'
import PeerId from 'peer-id'

let tmpDir: TmpDir
let tmpAppDataPath: string
let connectionsManager: ConnectionsManager

beforeEach(() => {
  jest.clearAllMocks()
  tmpDir = createTmpDir()
  tmpAppDataPath = tmpZbayDirPath(tmpDir.name)
  connectionsManager = null
})

describe('Connections manager', () => {
  it.skip('runs tor by default', async () => {
    const ports = await getPorts()
    connectionsManager = new ConnectionsManager({
      agentHost: 'localhost',
      agentPort: ports.socksPort,
      io: new DummyIOServer(),
      options: {
        env: {
          appDataPath: tmpAppDataPath
        },
        torControlPort: ports.controlPort
      }
    })
    await connectionsManager.init()
    expect(connectionsManager.tor.process).not.toBeNull()
    await connectionsManager.tor.kill()
  })

  it.skip('inits only tor control if spawnTor is set to false', async () => {
    const torPassword = 'testTorPassword'
    const ports = await getPorts()
    connectionsManager = new ConnectionsManager({
      agentHost: 'localhost',
      agentPort: ports.socksPort,
      io: new DummyIOServer(),
      options: {
        env: {
          appDataPath: tmpAppDataPath
        },
        spawnTor: false,
        torControlPort: ports.controlPort,
        torPassword
      }
    })
    await connectionsManager.init()
    expect(connectionsManager.tor.process).toBeNull()
    const torControl = connectionsManager.tor.torControl
    expect(torControl.password).toEqual(torPassword)
    expect(torControl.params.port).toEqual(ports.controlPort)
  })

  it.skip('create network', async() => {
    const ports = await getPorts()
    connectionsManager = new ConnectionsManager({
      agentHost: 'localhost',
      agentPort: ports.socksPort,
      io: new DummyIOServer(),
      options: {
        env: {
          appDataPath: tmpAppDataPath
        },
        torControlPort: ports.controlPort
      }
    })
    await connectionsManager.init()
    const network = await connectionsManager.createNetwork()
    expect(network.hiddenService.onionAddress).toHaveLength(56)
    expect(network.hiddenService.privateKey).toHaveLength(99)
    const peerId = await PeerId.createFromJSON(network.peerId)
    console.log(peerId, 'NETWOK')
    expect(PeerId.isPeerId(peerId)).toBeTruthy()
    await connectionsManager.tor.kill()
  })
  it('launch network with certs', async () => {
    const ports = await getPorts()
    connectionsManager = new ConnectionsManager({
      agentHost: 'localhost',
      agentPort: ports.socksPort,
      io: new DummyIOServer(),
      options: {
        env: {
          appDataPath: tmpAppDataPath
        },
        torControlPort: ports.controlPort
      }
    })



    await connectionsManager.init()


    const peerId = await PeerId.create()
    const listenAddress = 'ads'
    const bootstrapMultiaddress = ['asdf']
    const certs = {
cert: 'asdf',
key: 'sdf',
ca: ['sdfg']
    }

    await connectionsManager.initLibp2p(peerId, listenAddress, bootstrapMultiaddress, certs)
    await connectionsManager.tor.kill()
  })
})
