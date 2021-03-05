import * as fs from 'fs'
import * as os from 'os'
import * as child_process from 'child_process'
import * as path from 'path'
import { sleep } from '../sleep'
import { TorControl } from './torControl'

interface IService {
  port: number
  address: string
}
interface IConstructor {
  torPath: string
  settingsPath: string
  options?: child_process.SpawnOptionsWithoutStdio
}
export class Tor {
  process: child_process.ChildProcessWithoutNullStreams | null = null
  torPath: string
  settingsPath: string
  options?: child_process.SpawnOptionsWithoutStdio
  services: Map<number, IService>
  torControl: any
  constructor({ settingsPath, torPath, options }: IConstructor) {
    this.settingsPath = settingsPath
    this.torPath = torPath
    this.options = options
    this.services = new Map()
    this.torControl = new TorControl()
  }
  public init = (timeout = 200000): Promise<void> =>
    new Promise((resolve, reject) => {
      if (this.process) {
        throw new Error('Already initialized')
      }
      this.process = child_process.spawn(this.torPath, ['-f', this.settingsPath], this.options)
      const id = setTimeout(() => {
        this.process?.kill()
        reject('Process timeout')
      }, timeout)
      this.process.stdout.on('data', (data: Buffer) => {
        console.log(data.toString())
        if (data.toString().includes('100%')) {
          clearTimeout(id)
          const data = fs.readFileSync(this.settingsPath, 'utf8').split('\n')
          const services = data.filter(text => text.startsWith('#SERVICE_'))
          for (const service of services) {
            const port = parseInt(service.substring(9))
            this.services.set(port, {
              port,
              address: this.getServiceAddress(port)
            })
          }
          resolve()
        }
      })
    })

  public addService = async ({
    port = 3333,
    timeout = 8000,
    overwrite = true,
    secretKey = ''
  }): Promise<IService> => {
    if (this.process === null) {
      throw new Error('Process is not initalized.')
    }
    if (this.services.get(port)) {
      throw new Error('Service already exist')
    }

    if (
      fs.existsSync(`${path.join.apply(null, [os.homedir(), `tor_service_${port}`])}`) &&
      overwrite
    ) {
      fs.rmdirSync(`${path.join.apply(null, [os.homedir(), `tor_service_${port}`])}`, {
        recursive: true
      })
    }

    const homePath = path.join.apply(null, [os.homedir()])

    const newServices = `HiddenServiceDir="${path.join.apply(null, [
      homePath,
      `zbay_tor`
    ]).replace(/\\/g, '/')}" HiddenServicePort="80 127.0.0.1:3435" HiddenServiceDir="${path.join.apply(null, [
      homePath,
      `tor_service_${port}`
    ]).replace(/\\/g, '/')}" HiddenServicePort="${port} 127.0.0.1:${port}"`
    console.log(newServices)
    console.log(newServices.replace(/\\/g, '/'))

console.log('dupaaaa')

    this.torControl.setConf(newServices.replace(/\\/g, '/'), function (err: any, status: any) {
      if (err) {
        return console.error(err)
      }
      console.log(status.messages.join(' - '))
    })

    if (secretKey) {
      //console.log('env', process.env.HIDDEN_SERVICE_SECRET)
      const secretString = Buffer.from(secretKey, 'base64')
      //console.log('string', secretString)
      fs.mkdirSync(`${path.join.apply(null, [os.homedir(), `tor_service_${port}`])}`, {
        recursive: true
      })
      fs.chmodSync(`${path.join.apply(null, [os.homedir(), `tor_service_${port}`])}`, '0700')
      fs.writeFileSync(
        `${path.join.apply(null, [os.homedir(), `tor_service_${port}`, `hs_ed25519_secret_key`])}`,
        secretString,
        'utf8'
      )
    }
    const id = setTimeout(() => {
      throw new Error('Timeout')
    }, timeout)
    while (true) {
      let address: string | null = null
      try {
        address = this.getServiceAddress(port)
      } catch (error) {
        await sleep()
        continue
      }

      if (address === null) {
        await sleep()
        continue
      }
      clearTimeout(id)
      this.services.set(port, { port, address: address.trim() })
      return { port, address }
    }
  }
  public killService = async ({ port = 3333, deleteKeys = true }): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (this.process === null) {
        throw new Error('Process is not initalized.')
      }
      if (!this.services.get(port)) {
        throw new Error('Service does not exist.')
      }
      const homePath = path.join.apply(null, [os.homedir()])

      const newServices = `HiddenServiceDir="${path.join.apply(null, [
        homePath,
        `zbay_tor`
      ]).replace(/\\/g, '/')}" HiddenServicePort="80 127.0.0.1:3435"`

      this.services.delete(port)
      if (
        fs.existsSync(`${path.join.apply(null, [os.homedir(), `tor_service_${port}`])}`) &&
        deleteKeys
      ) {
        fs.rmdirSync(`${path.join.apply(null, [os.homedir(), `tor_service_${port}`])}`, {
          recursive: true
        })
      }
      this.torControl.setConf(newServices, function (err: any, status: any) {
        if (err) {
          reject(console.error(err))
        }
        resolve(status.messages.join(' - '))
      })
    })
  }
  public getServiceAddress = (port: number): string => {
    try {
      const address = fs
        .readFileSync(
          `${path.join.apply(null, [os.homedir(), `tor_service_${port}`, 'hostname'])}`,
          'utf8'
        )
        .replace(/[\r\n]+/gm, '')
      return address
    } catch (error) {
      throw new Error('Service does not exist')
    }
  }
  public kill = (): Promise<void> =>
    new Promise((resolve, reject) => {
      if (this.process === null) {
        reject('Process is not initalized.')
      }
      this.process?.on('close', () => {
        resolve()
      })
      this.process?.kill()
    })
}
