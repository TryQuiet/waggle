import express from 'express'
import { Tor } from '../torManager'
import {ZBAY_DIR_PATH} from '../constants'
import * as path from 'path'
import * as os from 'os'
import fs from 'fs'

class Tracker {
  private _app: express.Application
  private _peers: Set<string>
  private _onionAddress: string

  constructor() {
    this._app = express()
    this._peers = new Set()
  }

  private async initTor() {
    console.log(`${process.cwd()}`)
    const torPath = `${process.cwd()}/tor/tor`
    const pathDevLib = path.join.apply(null, [process.cwd(), 'tor'])
    console.log(pathDevLib)
    if(!fs.existsSync(ZBAY_DIR_PATH)) {
      fs.mkdirSync(ZBAY_DIR_PATH)
    }
    const tor = new Tor({
      torPath,
      appDataPath: ZBAY_DIR_PATH,
      controlPort: 9051,
      options: {
        env: {
          LD_LIBRARY_PATH: pathDevLib,
          HOME: os.homedir()
        },
        detached: true
      }
    })
    await tor.init()
    // await tor.setHttpTunnelPort(9082)
    return await tor.addNewService(7788, 7788)  // this should be static
  }

  private setRouting() {
    this._app.use(express.json())
    this._app.get('/peers', (req, res) => {
      res.send([...this._peers])
    })
    this._app.post('/register',(req, res) => {
      console.log(req.body)  // todo: validate
      if (!req.body['address']) {
        res.end()
        return
      }
      this._peers.add(req.body['address'])
      res.end()
    })
  }

  public async init() {
    await this.initTor()
    this.setRouting()
  }

  public listen() {
    this._app.listen(7788, () => {
      console.log(`Tracker listening on port 7788`)
    })
  }
}

const main = async () => {
  const tracker = new Tracker()
  await tracker.init()
  tracker.listen()
}

main()



