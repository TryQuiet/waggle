import express from 'express'
import { createServer, Server } from 'http'
const socketio = require('socket.io')

export class DataServer {
  public PORT: number = 4677
  private _app: express.Application
  private server: Server
  public io: SocketIO.Server
  constructor() {
    this._app = express()
    this.server = createServer(this._app)
    this.initSocket()
  }

  private initSocket = (): void => {
    this.io = socketio(this.server)
    }

    public listen = (): void => {
    this.server.listen(this.PORT, () => {
      console.debug(`Server running on port ${this.PORT}`)
    })
  }
}
