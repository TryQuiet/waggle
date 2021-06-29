import express from 'express'
import fp from 'find-free-port'
import { Tor } from '../torManager'
import { dataFromRootPems, ZBAY_DIR_PATH } from '../constants'
import * as path from 'path'
import * as os from 'os'
import fs from 'fs'
import debug from 'debug'
import { ConnectionsManager } from '../libp2p/connectionsManager'
import { createUserCert, createUserCsr } from '@zbayapp/identity/lib'
import { DummyIOServer, getPorts, Ports } from '../utils'
const log = Object.assign(debug('waggle:identity'), {
  error: debug('waggle:identity:err')
})

interface CertData {
  username: string,
  onionAddress: string,
  peerId: string
}

export class CertificateRegistration {
  private readonly _app: express.Application
  private readonly _port: number
  private readonly _controlPort: number
  private readonly _socksPort: number
  private readonly _privKey: string
  private _ports: Ports
  private _connectionsManager: ConnectionsManager

  constructor(hiddenServicePrivKey: string, port?: number, controlPort?: number, socksPort?: number) {
    this._app = express()
    this._privKey = hiddenServicePrivKey
    this._port = port || 7789
    this._controlPort = controlPort
    this._socksPort = socksPort
    this._connectionsManager = null
    this._ports = null
    this.setRouting()
  }

  private async setPorts() {
    this._ports = await getPorts()
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

  private async registerCertificate(data: CertData) {
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
    await this.setPorts()
    const onionAddress = await this.initTor()
    console.log(`Onion: ${onionAddress}`)
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
  
  private async initTor(): Promise<string> {
    const torPath = `${process.cwd()}/tor/tor`
    const pathDevLib = path.join.apply(null, [process.cwd(), 'tor'])
    if (!fs.existsSync(ZBAY_DIR_PATH)) {
      fs.mkdirSync(ZBAY_DIR_PATH)
    }
    const tor = new Tor({
      appDataPath: ZBAY_DIR_PATH,
      socksPort: this._ports.socksPort,
      torPath,
      controlPort: this._ports.controlPort,
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
        log(`Certificate registration listening on ${this._port}`)
        resolve()
      })
    })
  }
}

const main = async () => {
  const certRegister = new CertificateRegistration(process.env.HIDDEN_SERVICE_SECRET_CERT_REG)
  try {
    await certRegister.init()
  } catch (err) {
    console.log(`Couldn't initialize certificate registration: ${err as string}`)
  }
  try {
    await certRegister.listen()
  } catch (err) {
    console.log(`Certificate registration couldn't start listening: ${err as string}`)
  }
}

main().catch((err) => {
  console.log(`Couldn't start certificate registration: ${err as string}`)
})
