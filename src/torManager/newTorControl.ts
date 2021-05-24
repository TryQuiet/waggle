import net from 'net'
import events from 'events'
const EvenetEmitter = events.EventEmitter

interface IOpts {
  port?: number
  host?: string
  password?: string
  persistent?: boolean
  path?: string
}

class TorControl {
  connection: any = null
  eventEmitter: events.EventEmitter
  constructor(opts: IOpts) {
    this.eventEmitter = new EvenetEmitter()
  }

  private async connect(opts) {
    return await new Promise((resolve, reject) => {
      if (this.connection) {
        reject('Connection already established')
      }

      this.connection = net.connect(opts)

      this.connection.once('error', err => {
        console.log(`TOR: Connection to controlPort failed: ${err}`)
      })
      this.connection.on('data', (data: any) => {
        console.log(`data is ${data}`)
        // this.eventEmitter.emit('data', data)
      })
      this.connection.on('end', () => {
        console.log('connection ended')
        this.connection = null
        // this.eventEmitter.emit('end')
      })
    })
  }
}
