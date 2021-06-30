import express from 'express'
import fp from 'find-free-port'
import { Tor } from '../torManager'
import { dataFromRootPems, ZBAY_DIR_PATH } from '../constants'
import * as path from 'path'
import * as os from 'os'
import fs from 'fs'
import { Certificate, AttributeTypeAndValue } from 'pkijs'
import debug from 'debug'
import { ConnectionsManager } from '../libp2p/connectionsManager'
import { createUserCert, createUserCsr, loadCSR } from '@zbayapp/identity'
import { DummyIOServer, getPorts, Ports } from '../utils'
import { CertFieldsTypes } from '@zbayapp/identity/lib/common'
const log = Object.assign(debug('waggle:identity'), {
  error: debug('waggle:identity:err')
})

export class CertificateRegistration {
  private readonly _app: express.Application
  private readonly _port: number
  private readonly _controlPort: number
  private readonly _socksPort: number
  private readonly _privKey: string
  private _ports: Ports
  private tor: Tor
  private _connectionsManager: ConnectionsManager

  constructor(hiddenServicePrivKey: string, tor: Tor, port?: number, controlPort?: number, socksPort?: number) {
    this._app = express()
    this._privKey = hiddenServicePrivKey
    this._port = port || 7789
    this._controlPort = controlPort
    this._socksPort = socksPort
    this._connectionsManager = null
    this._ports = null
    this.tor = tor
    this.setRouting()
  }

  private async setPorts() {
    this._ports = await getPorts()
  }

  private setRouting() {
    this._app.use(express.json())
    this._app.post('/register', async (req, res) => {
      const data: string = req.body.data  // user csr
      if (!data) {
        log('No csr')
        res.status(400)
        return
      }
      let parsedCsr: Certificate
      try {
        parsedCsr = this.parseUserCsr(data)
      } catch (e) {
        log('Could not parse csr')
        res.status(400)
        return
      }

      const cert = await this.registerCertificate(parsedCsr)
      if (!cert) {
        res.status(403)
      }
      res.send(cert.userCertString)
    })
  }

  private async parseUserCsr(userCsr: string): Promise<Certificate> {
    let parsedCsr = null
    try {
      parsedCsr = await loadCSR(userCsr)
    } catch (e) {
      log.error(e)
      throw e
    }

    try {
      this.extractUsernameFromCsr(parsedCsr)
    } catch (e) {
      log.error(e)
      throw e
    }

    return parsedCsr
  }

  private extractUsernameFromCsr(csr: Certificate): string {
    const usernameblock = csr.subject.typesAndValues.find((tav: AttributeTypeAndValue) => tav.type === CertFieldsTypes.nickName)
    const username = usernameblock.value.valueBlock.value
    console.log(username)
    return username
  }

  private async registerCertificate(userCsr: Certificate): Promise<Certificate> {
    const username = this.extractUsernameFromCsr(userCsr)
    const usernameExists = this._connectionsManager.storage.validateUsername(username)
    if (usernameExists) {
      return null
    }

    const userCert = await createUserCert(dataFromRootPems.certificate, dataFromRootPems.privKey, userCsr, new Date(), new Date(2030, 1, 1))
    await this._connectionsManager.storage.saveCertificate(userCert.userCertString)
    return userCert
  }

  public async init() {
    await this.setPorts()
    const onionAddress = await this.tor.spawnHiddenService({
      virtPort: this._port,
      targetPort: this._port,
      privKey: this._privKey
    })
    console.log('ONION ADDRESS', onionAddress)
    this._connectionsManager = new ConnectionsManager({
      host: onionAddress,
      port: this._ports.libp2pHiddenService,
      agentHost: 'localhost',
      agentPort: this._ports.socksPort,
      io: new DummyIOServer()
    })
    await this._connectionsManager.initializeNode()
    await this._connectionsManager.initStorage()
  }

  public async listen(): Promise<void> {
    return await new Promise(resolve => {
      this._app.listen(this._port, () => {
        log(`Certificate registration service listening on ${this._port}`)
        resolve()
      })
    })
  }
}
