import { ConnectionsManager } from '../libp2p/connectionsManager'
import { createCertificatesTestHelper } from '../libp2p/tests/client-server'
import { createMinConnectionManager, createTmpDir, ResponseMock, tmpZbayDirPath, TorMock } from '../testUtils'
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
    const torInitMock = jest.fn(async () => {
      // @ts-expect-error
      manager.tor = new TorMock()
    })
    manager.init = torInitMock
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
    const pems = await createCertificatesTestHelper('adres1.onion', 'adres2.onion')
    const certs = {
      cert: pems.userCert,
      key: pems.userKey,
      ca: [pems.ca]
    }
    await ioProxy.createCommunity('MyCommunity', certs)
    expect(observedLaunchRegistrar).not.toBeCalled()
    const communityData = await observedCommunityCreate.mock.results[0].value
    expect(observedIO).lastCalledWith(EventTypesResponse.NEW_COMMUNITY, { id: 'MyCommunity', payload: communityData })
  })

  it('emits error if connecting to registrar fails', async () => {
    const observedIO = jest.spyOn(ioProxy.io, 'emit')
    await ioProxy.registerUserCertificate('improperServiceAddress.onion', 'userCsr', 'someCommunityId')
    expect(observedIO).toBeCalledTimes(1)
    expect(observedIO).toBeCalledWith(EventTypesResponse.ERROR, {type: EventTypesResponse.REGISTRAR, message: 'Connecting to registrar failed', communityId: 'someCommunityId', code: 500})
  })

  it('emits validation error if registrar returns validation error', async () => {
    const observedIO = jest.spyOn(ioProxy.io, 'emit')
    const mockRegisterCertificate = jest.fn()
    ioProxy.connectionsManager.sendCertificateRegistrationRequest = mockRegisterCertificate
    mockRegisterCertificate.mockReturnValue(Promise.resolve(new ResponseMock().init(403)))
    await ioProxy.registerUserCertificate('http://properAddress.onion', 'userCsr', 'someCommunityId')
    expect(observedIO).toBeCalledTimes(1)
    expect(observedIO).toBeCalledWith(EventTypesResponse.ERROR, {type: EventTypesResponse.REGISTRAR, message: 'Username already taken.', communityId: 'someCommunityId', code: 403})
  })

  it('sends user certificate after successful registration', async () => {
    const registrarResponse = {
      certificate: 'userCertificate',
      peers: ['peer1', 'peer2']
    }
    const observedIO = jest.spyOn(ioProxy.io, 'emit')
    const mockRegisterCertificate = jest.fn()
    ioProxy.connectionsManager.sendCertificateRegistrationRequest = mockRegisterCertificate
    mockRegisterCertificate.mockReturnValue(Promise.resolve(new ResponseMock().init(200, registrarResponse)))
    await ioProxy.registerUserCertificate('http://properAddress.onion', 'userCsr', 'someCommunityId')
    expect(observedIO).toBeCalledTimes(1)
    expect(observedIO).toBeCalledWith(EventTypesResponse.SEND_USER_CERTIFICATE, { id: 'someCommunityId', payload: registrarResponse })
  })
})
