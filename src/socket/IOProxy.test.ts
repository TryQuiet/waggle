import { ConnectionsManager } from '../libp2p/connectionsManager'
import { createMinConnectionManager, createTmpDir, tmpZbayDirPath } from '../testUtils'
import { getPorts } from '../utils'
import { EventTypesResponse } from './constantsReponse'
import IOProxy from './IOProxy'

describe('IO proxy', () => {
  let manager: ConnectionsManager
  let ioProxy: IOProxy

  beforeEach(async () => {
    jest.clearAllMocks()
    const appDataPath = createTmpDir()
    const ports = await getPorts()
    manager = createMinConnectionManager({
      env: { appDataPath: tmpZbayDirPath(appDataPath.name) },
      torControlPort: ports.controlPort
    })
    await manager.init()
    ioProxy = new IOProxy(manager)
  })

  afterEach(async () => {
    await ioProxy.communities.closeStorages()
    await manager.tor.kill()
  })

  it('creates community without running registrar for regular user', async () => {
    const observedLaunchRegistrar = jest.spyOn(ioProxy, 'launchRegistrar')
    const observedIO = jest.spyOn(ioProxy.io, 'emit')
    const observedCommunityCreate = jest.spyOn(ioProxy.communities, 'create')
    await ioProxy.createCommunity('MyCommunity')
    expect(observedLaunchRegistrar).not.toBeCalled()
    const communityData = await observedCommunityCreate.mock.results[0].value
    expect(observedIO).lastCalledWith(EventTypesResponse.NEW_COMMUNITY, { id: 'MyCommunity', payload: communityData })
  })
})
