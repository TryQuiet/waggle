import { rejects, throws } from 'assert'
import net from 'net'

interface IOpts {
  port: number
  host: string
  password: string
}

interface ITorResponse {
  code: number
  messages: string[]
}
interface IParams {
  port: number
  host: string
}

export class TorControl {
  connection: net.Socket
  password: string
  params: IParams
  constructor(opts: IOpts) {
    this.params = {
      port: opts.port,
      host: opts.host
    }
    this.password = opts.password
  }

  private async connect(): Promise<void> {
    return await new Promise((resolve, reject) => {
      if (this.connection) {
        reject('Connection already established')
      }

      this.connection = net.connect(this.params)

      this.connection.once('error', err => {
        reject(`TOR: Connection via tor control failed: ${err}`)
      })
      this.connection.once('data', (data: any) => {
        console.log(`${data.toString()}`)
        if (/250 OK/.test(data.toString())) {
          resolve()
        } else {
          reject(`Connection error: ${data.toString()}`)
        }
      })
      this.connection.write('AUTHENTICATE "' + this.password + '"\r\n')
    })
  }

  private async disconnect() {
    this.connection.end()
  }

  private async _sendCommand(command: string, resolve: Function, reject: Function) {
    await this.connect()
    const connectionTimeout = setTimeout(() => {
      reject('TOR: Send command timeout')
    }, 5000)
    this.connection.on('data', async data => {
      await this.disconnect()
      const dataArray = data.toString().split(/\r?\n/)
      if (dataArray[0].startsWith('250')) {
        resolve({ code: 250, messages: dataArray })
      } else {
        clearTimeout(connectionTimeout)
        reject(`${dataArray[0]}`)
      }
      clearTimeout(connectionTimeout)
    })
    this.connection.write(command + '\r\n')
  }

  public async sendCommand(command: string): Promise<{ code: number; messages: string[] }> {
    return new Promise((resolve, reject) => {
      this._sendCommand(command, resolve, reject)
    })
  }
}