import express from 'express'
import { Tor } from '../torManager'
import { dataFromRootPems, ZBAY_DIR_PATH } from '../constants'
import * as path from 'path'
import * as os from 'os'
import fs from 'fs'
import debug from 'debug'
import { ConnectionsManager } from '../libp2p/connectionsManager'
import { createUserCert, createUserCsr } from '@zbayapp/identity/lib'
const log = Object.assign(debug('waggle:tracker'), {
  error: debug('waggle:tracker:err')
})

export class Registration {
  private readonly _app: express.Application
  private readonly _port: number
  private readonly _controlPort: number
  private readonly _socksPort: number
  private readonly _privKey: string
  private _connectionsManager: ConnectionsManager

  constructor(hiddenServicePrivKey: string, port?: number, controlPort?: number, socksPort?: number) {
    this._app = express()
    this._privKey = hiddenServicePrivKey
    this._port = port || 7788
    this._controlPort = controlPort || 9051
    this._socksPort = socksPort || 9152
    this._connectionsManager = null
    this.setRouting()
  }

  private setRouting() {
    this._app.use(express.json())
    this._app.post('/register', async (req, res) => {
      const data = req.body.data  // We need username, onionAddress and peerId
      if (!data) {
        log('User data needed for registration')
        res.status(400)
      }
      const cert = await this.registerCertificate(data)
      if (!cert) {
        res.status(403)
      }
      res.send(cert.userCertString)
    })
  }

  private async registerCertificate(data) {
    const usernameExists = this._connectionsManager.storage.validateUsername(data.username)
    if (usernameExists) {
      return null
    }
    const user = await createUserCsr({
      zbayNickname: data.username,
      commonName: data.onionAddress,
      peerId: data.peerId
    })

    // todo: set proper notAfterDate
    const userCert = await createUserCert(dataFromRootPems.certificate, dataFromRootPems.privKey, user.userCsr, new Date(), new Date(2030, 1, 1))
    await this._connectionsManager.storage.saveCertificate(userCert.userCertString)
    return userCert
  }

  public async init() {
    this.initTor()
    this._connectionsManager = new ConnectionsManager({
      host: 'localhost',
      port: this._port,
      agentHost: 'localhost',
      agentPort: 9999,
      io: null
    })
    await this._connectionsManager.initializeNode()
    await this._connectionsManager.initStorage()
  }
  
  private async initTor() {
    const torPath = `${process.cwd()}/tor/tor`
    const pathDevLib = path.join.apply(null, [process.cwd(), 'tor'])
    if (!fs.existsSync(ZBAY_DIR_PATH)) {
      fs.mkdirSync(ZBAY_DIR_PATH)
    }
    const tor = new Tor({
      appDataPath: ZBAY_DIR_PATH,
      socksPort: this._socksPort,
      torPath,
      controlPort: this._controlPort,
      options: {
        env: {
          LD_LIBRARY_PATH: pathDevLib,
          HOME: os.homedir()
        },
        detached: true
      }
    })

    await tor.init()
    return await tor.spawnHiddenService({
      virtPort: this._port,
      targetPort: this._port,
      privKey: this._privKey
    })
  }

  public async listen(): Promise<void> {
    return await new Promise(resolve => {
      this._app.listen(this._port, () => {
        log(`Tracker listening on ${this._port}`)
        resolve()
      })
    })
  }
}
