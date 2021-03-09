import { Tor } from './torManager'
import { DataServer } from './socket/DataServer'
import { ConnectionsManager } from './libp2p/connectionsManager'
import initListeners from './socket/listeners/'
import * as path from 'path'
import * as os from 'os'
import fs from 'fs'
import PeerId from 'peer-id'

const main = async () => {
  const torPath = `${process.cwd()}/tor/tor`
  const settingsPath = `${process.cwd()}/tor/torrc`
  const pathDevLib = path.join.apply(null, [process.cwd(), 'tor'])
  const tor = new Tor({
    torPath,
    settingsPath,
    options: {
      env: {
        LD_LIBRARY_PATH: pathDevLib,
        HOME: os.homedir()
      }
    }
  })
  await tor.init()

  //await tor.addOnion({port: 3435, privKey: 'ED25519-V3:wDPkPj+yYyWzJjzWYGqeO8IOe9PFZY1rPGM0F48Qh2kecRIFlixjNh+znBOW21Bv6g0/TQS/Ej/czJX0enMaoA=='})
   const dupa = await tor.addNewService({port: 1234})
console.log(dupa)

}

main()
