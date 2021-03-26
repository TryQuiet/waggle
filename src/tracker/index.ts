import express from 'express'
import { Tor } from '../torManager'
import {ZBAY_DIR_PATH} from '../constants'
import * as path from 'path'
import * as os from 'os'
import fs from 'fs'
import multiaddr from 'multiaddr'

export class Tracker {
  private _app: express.Application
  private _peers: Set<string>
  private _port: number
  private _controlPort: number

  constructor(port?: number, controlPort?: number) {
    this._app = express()
    this._peers = new Set()
    this._port = port || 7788
    this._controlPort = controlPort || 9051
  }

  private async initTor() {
    const torPath = `${process.cwd()}/tor/tor`
    const pathDevLib = path.join.apply(null, [process.cwd(), 'tor'])
    if(!fs.existsSync(ZBAY_DIR_PATH)) {
      fs.mkdirSync(ZBAY_DIR_PATH)
    }
    const tor = new Tor({
      torPath,
      appDataPath: ZBAY_DIR_PATH,
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
    return await tor.addOnion({ virtPort: this._port, targetPort: this._port, privKey: process.env.HIDDEN_SERVICE_SECRET })
  }

  private addPeer(address: string) {
    try {
      multiaddr(address)
    } catch (e) {
      console.debug('Wrong address format:', e)
      return
    }
    
    this._peers.add(address)
  }

  private getPeers(): string[] {
    return [...this._peers]
  }

  private setRouting() {
    this._app.use(express.json())
    this._app.get('/peers', (req, res) => {
      res.send(this.getPeers())
    })
    this._app.post('/register',(req, res) => {
      console.log('body', req.body)
      const address = req.body['address']
      if (!address) {
        res.end()
        return
      }
      this.addPeer(address)
      res.end()
    })
  }

  public async init() {
    await this.initTor()
    this.setRouting()
  }

  public listen() {
    this._app.listen(this._port, () => {
      console.debug(`Tracker listening on ${this._port}`)
    })
  }
}

const main = async () => {
  const tracker = new Tracker()
  await tracker.init()
  tracker.listen()
}

main()



