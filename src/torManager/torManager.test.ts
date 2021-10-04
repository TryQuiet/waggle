/* eslint import/first: 0 */
import { Tor } from './torManager'
import { torBinForPlatform, torDirForPlatform } from '../common/utils'
import { createTmpDir, spawnTorProcess, TmpDir, tmpZbayDirPath } from '../common/testUtils'
import fp from 'find-free-port'

jest.setTimeout(100_000)

let tmpDir: TmpDir
let tmpAppDataPath: string

beforeEach(() => {
  jest.clearAllMocks()
  tmpDir = createTmpDir()
  tmpAppDataPath = tmpZbayDirPath(tmpDir.name)
})

afterEach(async () => {
  tmpDir.removeCallback()
})

describe('Tor manager', () => {
  it('starts and closes tor', async () => {
    const tor = await spawnTorProcess(tmpAppDataPath)
    await tor.init()
    await tor.kill()
  })

  it('should detect and kill old tor process before new tor is spawned', async () => {
    // This does not pass on windows (EBUSY: resource busy or locked, unlink '(...)\.zbay\TorDataDirectory\lock')
    // Probably only test config issue
    const torPath = torBinForPlatform()
    const [controlPort] = await fp(9051)
    const httpTunnelPort = (await fp(controlPort as number + 1)).shift()
    const socksPort = (await fp(httpTunnelPort as number + 1)).shift()
    const libPath = torDirForPlatform()
    const tor = new Tor({
      appDataPath: tmpAppDataPath,
      socksPort,
      torPath: torPath,
      controlPort,
      httpTunnelPort,
      options: {
        env: {
          LD_LIBRARY_PATH: libPath,
          HOME: tmpAppDataPath
        },
        detached: true
      }
    })

    await tor.init()

    const torSecondInstance = new Tor({
      appDataPath: tmpAppDataPath,
      socksPort,
      torPath: torPath,
      controlPort,
      httpTunnelPort,
      options: {
        env: {
          LD_LIBRARY_PATH: libPath,
          HOME: tmpAppDataPath
        },
        detached: true
      }
    })
    await torSecondInstance.init({})
    await torSecondInstance.kill()
  })

  it('spawns new hidden service', async () => {
    const tor = await spawnTorProcess(tmpAppDataPath)
    await tor.init()
    const hiddenService = await tor.createNewHiddenService(4343, 4343)
    expect(hiddenService.onionAddress.split('.')[0]).toHaveLength(56)
    await tor.kill()
  })

  it('spawns hidden service using private key', async () => {
    const tor = await spawnTorProcess(tmpAppDataPath)
    await tor.init()
    const hiddenServiceOnionAddress = await tor.spawnHiddenService({
      virtPort: 4343,
      targetPort: 4343,
      privKey:
        'ED25519-V3:uCr5t3EcOCwig4cu7pWY6996whV+evrRlI0iIIsjV3uCz4rx46sB3CPq8lXEWhjGl2jlyreomORirKcz9mmcdQ=='
    })
    expect(hiddenServiceOnionAddress).toBe('u2rg2direy34dj77375h2fbhsc2tvxj752h4tlso64mjnlevcv54oaad.onion')
    await tor.kill()
  })

  it('generates hashed password', async () => {
    const tor = await spawnTorProcess(tmpAppDataPath)
    tor.generateHashedPassword()
    console.log(tor.torHashedPassword)
    console.log(tor.torPassword)
    expect(tor.torHashedPassword).toHaveLength(61)
    expect(tor.torPassword).toHaveLength(32)
  })

  it('tor spawn repeating 3 times with 1 second timeout and repeating will stop after that', async () => {
    const torPath = torBinForPlatform()
    const [controlPort] = await fp(9051)
    const httpTunnelPort = (await fp(controlPort as number + 1)).shift()
    const socksPort = (await fp(httpTunnelPort as number + 1)).shift()
    const libPath = torDirForPlatform()
    const tor = new Tor({
      appDataPath: tmpAppDataPath,
      socksPort,
      torPath: torPath,
      controlPort,
      httpTunnelPort,
      options: {
        env: {
          LD_LIBRARY_PATH: libPath,
          HOME: tmpAppDataPath
        },
        detached: true
      }
    })

    await expect(tor.init({ repeat: 3, timeout: 1000 }))
      .rejects
      .toThrow('Failed to spawn tor 4 times')

    await tor.kill()
  })

  it('tor is initializing correctly with 40 seconds timeout', async () => {
    const torPath = torBinForPlatform()
    const [controlPort] = await fp(9051)
    const httpTunnelPort = (await fp(controlPort as number + 1)).shift()
    const socksPort = (await fp(httpTunnelPort as number + 1)).shift()
    const libPath = torDirForPlatform()
    const tor = new Tor({
      appDataPath: tmpAppDataPath,
      socksPort,
      torPath: torPath,
      controlPort,
      httpTunnelPort,
      options: {
        env: {
          LD_LIBRARY_PATH: libPath,
          HOME: tmpAppDataPath
        },
        detached: true
      }
    })

    await tor.init({ repeat: 3, timeout: 40000 })
    await tor.kill()
  })

  it('creates and destroys hidden service', async () => {
    const tor = await spawnTorProcess(tmpAppDataPath)
    await tor.init()
    const hiddenService = await tor.createNewHiddenService(4343, 4343)
    const serviceId = hiddenService.onionAddress.split('.')[0]
    const status = await tor.destroyHiddenService(serviceId)
    expect(status).toBe(true)
    await tor.kill()
  })

  it('attempt destroy nonexistent hidden service', async () => {
    const tor = await spawnTorProcess(tmpAppDataPath)
    await tor.init()
    const status = await tor.destroyHiddenService('u2rg2direy34dj77375h2fbhsc2tvxj752h4tlso64mjnlevcv54oaad')
    expect(status).toBe(false)
    await tor.kill()
  })
})
