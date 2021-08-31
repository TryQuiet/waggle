import CommunitiesManager from './manager'
import { ConnectionsManager } from '../libp2p/connectionsManager'
import { createMinConnectionManager, createTmpDir } from '../testUtils'
import PeerId from 'peer-id'

describe('Community manager', () => {
  let connectionsManager: ConnectionsManager
  let manager: CommunitiesManager

  beforeEach(async () => {
    const appDataPath = createTmpDir()
    connectionsManager = createMinConnectionManager({ env: { appDataPath: appDataPath.name } })
    await connectionsManager.init()
  })

  afterEach(async () => {
    manager && await manager.closeStorages()
    await connectionsManager.tor.kill()
  })

  it('creates new community', async () => {
    manager = new CommunitiesManager(connectionsManager)
    expect(manager.communities.size).toBe(0)
    const communityData = await manager.create()
    expect(manager.communities.size).toBe(1)
    expect(manager.communities.has(communityData.peerId.id)).toBeTruthy()
  })

  it('launches community', async () => {
    manager = new CommunitiesManager(connectionsManager)
    expect(manager.communities.size).toBe(0)
    const peerId = await PeerId.create()
    const localAddress = await manager.launch(
      peerId.toJSON(),
      'ED25519-V3:YKbZb2pGbMt44qunoxvrxCKenRomAI9b/HkPB5mWgU9wIm7wqS+43t0yLiCmjSu+FW4f9qFW91c4r6BAsXS9Lg==',
      ['peeraddress']
    )
    expect(localAddress).toContain(peerId.toB58String())
    expect(manager.communities.size).toBe(1)
  })
})
