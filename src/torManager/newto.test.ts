import { Tor } from './torManager'
import { ZBAY_DIR_PATH } from '../constants'

jest.setTimeout(50000)

test('spawn hidden service using private key', async () => {
    const torPath = `${process.cwd()}/tor/tor`
    const libPath = `${process.cwd()}/tor`
    const tor = new Tor({
      torPath: torPath,
      appDataPath: ZBAY_DIR_PATH,
      controlPort: 9999,
      socksPort: 9154,
      options: {
        env: {
          LD_LIBRARY_PATH: libPath,
          HOME: ZBAY_DIR_PATH
        },
        detached: true
      }
    })
   await tor.init()
    const hiddenServiceOnionAddress = await tor.spawnHiddenService({
      virtPort: 4343,
      targetPort: 4343,
      privKey:
        'ED25519-V3:uCr5t3EcOCwig4cu7pWY6996whV+evrRlI0iIIsjV3uCz4rx46sB3CPq8lXEWhjGl2jlyreomORirKcz9mmcdQ=='
    })

    //const password = tor.generateHashedPassword()
    expect(hiddenServiceOnionAddress).toBe('u2rg2direy34dj77375h2fbhsc2tvxj752h4tlso64mjnlevcv54oaad')
    await tor.kill()
    console.log('aft3r killing tor ')
  })