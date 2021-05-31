import * as child_process from 'child_process'
import * as fs from 'fs'
import path from 'path'
import { TorControl } from './TorControl'
import { ZBAY_DIR_PATH } from '../constants'
import debug from 'debug'
import crypto from 'crypto'
const log = Object.assign(debug('waggle:tor'), {
  error: debug('waggle:tor:err')
})

interface IService {
  virtPort: number
  address: string
}
interface IConstructor {
  torPath: string
  options: child_process.SpawnOptionsWithoutStdio
  appDataPath: string
  controlPort: number
  socksPort: number
}
export class Tor {
  process: child_process.ChildProcessWithoutNullStreams | any = null
  torPath: string
  options?: child_process.SpawnOptionsWithoutStdio
  services: Map<number, IService>
  torControl: TorControl
  appDataPath: string
  controlPort: number
  torDataDirectory: string
  torPidPath: string
  socksPort: string
  torPassword: string
  torHashedPassword: string
  constructor({ torPath, options, appDataPath, controlPort, socksPort }: IConstructor) {
    this.torPath = torPath
    this.options = options
    this.services = new Map()
    this.torControl = new TorControl({ port: controlPort, host: 'localhost', password: 'dupa' })
    this.appDataPath = appDataPath
    this.controlPort = controlPort
    this.socksPort = socksPort.toString()
  }

  public init = async (): Promise<void> => {
    return await new Promise((resolve): void => {
      if (this.process) {
        throw new Error('Tor already initialized')
      }
      this.generateHashedPassword()
      this.torControl = new TorControl({
        port: this.controlPort,
        host: 'localhost',
        password: this.torPassword
      })
      const dirPath = this.appDataPath || ZBAY_DIR_PATH

      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath)
      }

      this.torDataDirectory = path.join.apply(null, [dirPath, 'TorDataDirectory'])
      this.torPidPath = path.join.apply(null, [dirPath, 'torPid.json'])
      let oldTorPid = null

      if (fs.existsSync(this.torPidPath)) {
        const file = fs.readFileSync(this.torPidPath)
        oldTorPid = Number(file.toString())
      }

      if (oldTorPid && process.platform !== 'win32') {
        child_process.exec(`ps -p ${oldTorPid as string} -o comm=`, (err, stdout, _stderr) => {
          if (err) {
            log(err)
          }
          if (stdout.trim() === 'tor') {
            process.kill(oldTorPid, 'SIGTERM')
          } else {
            fs.unlinkSync(this.torPidPath)
          }
          this.spawnTor(resolve)
        })
      } else {
        this.spawnTor(resolve)
      }
    })
  }

  private readonly spawnTor = resolve => {
    this.process = child_process.spawn(
      this.torPath,
      [
        '--SocksPort',
        this.socksPort,
        '--ControlPort',
        this.controlPort.toString(),
        '--PidFile',
        this.torPidPath,
        '--DataDirectory',
        this.torDataDirectory,
        '--HashedControlPassword',
        this.torHashedPassword.trim()
      ],
      this.options
    )
    this.process.stdout.on('data', data => {
      log(data.toString())
      const regexp = /Bootstrapped 100%/
      if (regexp.test(data.toString())) resolve()
    })
  }

  public async spawnHiddenService({
    virtPort,
    targetPort,
    privKey
  }: {
    virtPort: number
    targetPort: number
    privKey: string
  }): Promise<any> {
    const status = await this.torControl.sendCommand(
      `ADD_ONION ${privKey} Flags=Detach Port=${virtPort},127.0.0.1:${targetPort}`
    )
    const onionAddress = status.messages[0].replace('250-ServiceID=', '')
    this.services.set(virtPort, {
      virtPort,
      address: onionAddress
    })
    return onionAddress
  }

  public async createNewHiddenService(
    virtPort: number,
    targetPort: number
  ): Promise<{ onionAddress: string, privateKey: string }> {
    const status = await this.torControl.sendCommand(
      `ADD_ONION NEW:BEST Flags=Detach Port=${virtPort},127.0.0.1:${targetPort}`
    )

    const onionAddress = status.messages[0].replace('250-ServiceID=', '')
    const privateKey = status.messages[1].replace('250-PrivateKey=', '')
    this.services.set(virtPort, {
      virtPort,
      address: onionAddress
    })
    return {
      onionAddress,
      privateKey
    }
  }

  public generateHashedPassword = () => {
    const password = crypto.randomBytes(16).toString('hex')
    const hashedPassword = child_process.execSync(`${this.torPath} --hash-password ${password}`)
    this.torPassword = password
    this.torHashedPassword = hashedPassword.toString()
  }

  public getServiceAddress = (port: number): string => {
    if (this.services.get(port).address) {
      return this.services.get(port).address
    }
    throw new Error('cannot get service addres')
  }

  public kill = async (): Promise<void> =>
    await new Promise((resolve, reject) => {
      if (this.process === null) {
        reject(new Error('Process is not initalized.'))
      }
      this.process?.on('close', () => {
        resolve()
      })
      this.process?.kill()
    })
}
