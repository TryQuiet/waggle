import express from 'express'
import { Tor } from '../torManager'
import { dataFromRootPems } from '../constants'
import { Certificate } from 'pkijs'
import debug from 'debug'
import { ConnectionsManager } from '../libp2p/connectionsManager'
import { createUserCert, loadCSR } from '@zbayapp/identity'
import { getCertFieldValue } from '../utils'
import { CertFieldsTypes } from '@zbayapp/identity/lib/common'
import { Server } from 'http'
const log = Object.assign(debug('waggle:identity'), {
  error: debug('waggle:identity:err')
})

interface UserCsrData {
  csr: string
}

export class CertificateRegistration {
  private readonly _app: express.Application
  private _server: Server
  private readonly _port: number
  private readonly _privKey: string
  private tor: Tor
  private _connectionsManager: ConnectionsManager
  private _onionAddress: string

  constructor(hiddenServicePrivKey: string, tor: Tor, connectionsManager: ConnectionsManager, port?: number) {
    this._app = express()
    this._privKey = hiddenServicePrivKey
    this._port = port || 7789
    this._connectionsManager = connectionsManager
    this.tor = tor
    this._onionAddress = null
    this.setRouting()
  }

  private setRouting() {
    this._app.use(express.json())
    this._app.post('/register', (req, res) => this.registerUser(req, res))
  }

  private async registerUser(req, res) {
    const data: UserCsrData = req.body // TODO: add validation
    console.log('HERE')
    if (!data) {
      log('No csr')
      res.status(400)
      return
    }

    let username: string
    try {
      const parsedCsr = await loadCSR(data.csr)
      username = getCertFieldValue(parsedCsr, CertFieldsTypes.nickName)
    } catch (e) {
      log.error(`Could not parse csr: ${e.message}`)
      res.status(400)
      return
    }
    
    const usernameExists = this._connectionsManager.storage.usernameExists(username)
    if (usernameExists) {
      log('Username taken')
      res.status(403)
      return
    }
    const cert = await this.registerCertificate(data.csr)
    res.send(cert.userCertString)
  }

  private async registerCertificate(userCsr: string): Promise<Certificate> {
    const userCert = await createUserCert(dataFromRootPems.certificate, dataFromRootPems.privKey, userCsr, new Date(), new Date(2030, 1, 1))
    await this._connectionsManager.storage.saveCertificate(userCert.userCertString)
    log('Saved certificate')
    return userCert
  }

  public async init() {
    this._onionAddress = await this.tor.spawnHiddenService({
      virtPort: this._port,
      targetPort: this._port,
      privKey: this._privKey
    })
  }

  public async listen(): Promise<void> {
    return await new Promise(resolve => {
      this._server = this._app.listen(this._port, () => {
        log(`Certificate registration service listening on ${this._onionAddress}.onion:${this._port}`)
        resolve()
      })
    })
  }

  public async stop(): Promise<void> {
    return await new Promise(resolve => {
      this._server.close(() => {
        log('Certificate registration service closed')
        resolve()
      })
    })
  }
}
