import * as child_process from 'child_process'
import * as fs from 'fs'
import path from 'path'
import { TorControl } from './TorControl'
import { ZBAY_DIR_PATH } from '../constants'
import debug from 'debug'
import crypto from 'crypto'
import { removeFilesFromDir } from '../utils'
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
  httpTunnelPort?: number
  torPassword?: string
  torAuthCookie?: string
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
  httpTunnelPort: string
  torPassword: string
  torHashedPassword: string
  torAuthCookie: string
  constructor({ torPath, options, appDataPath, controlPort, socksPort, httpTunnelPort, torPassword, torAuthCookie }: IConstructor) {
    this.torPath = path.normalize(torPath)
    this.options = options
    this.services = new Map()
    this.appDataPath = appDataPath
    this.controlPort = controlPort
    this.torPassword = torPassword
    this.torAuthCookie = torAuthCookie
    this.socksPort = socksPort.toString()
    this.httpTunnelPort = httpTunnelPort ? httpTunnelPort.toString() : null
  }

  public init = async ({ repeat = 3, timeout = 40000 }): Promise<void> => {
    return await new Promise((resolve, reject) => {
      if (this.process) {
        throw new Error('Tor already initialized')
      }
      this.generateHashedPassword()
      this.initTorControl()
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
      let counter = 0

      const spawnTorInsure = async () => {
        console.log(counter)
        if (counter > repeat) {
          console.log('hejoooo')
          reject(new Error(`Failed to spawn tor ${counter} times`))
          return
        }
        if (oldTorPid && process.platform !== 'win32') {
          child_process.exec(
            this.torProcessNameCommand(oldTorPid.toString()),
            (err: child_process.ExecException, stdout: string, _stderr: string) => {
              if (err) {
                log.error(err)
              }
              if (stdout.trim() === 'tor') {
                process.kill(oldTorPid, 'SIGTERM')
              } else {
                fs.unlinkSync(this.torPidPath)
              }
              oldTorPid = null
            }
          )
        }
        try {
          await this.spawnTor(timeout)
          resolve()
        } catch {
          await this.process.kill()
          await removeFilesFromDir(this.torDataDirectory)
          counter++

          // eslint-disable-next-line
          process.nextTick(spawnTorInsure)
        }
      }
      // eslint-disable-next-line
      spawnTorInsure()

    })
  }

  public initTorControl = () => {
    this.torControl = new TorControl({
      port: this.controlPort,
      host: 'localhost',
      password: this.torPassword,
      cookie: this.torAuthCookie
    })
  }

  private readonly torProcessNameCommand = (oldTorPid: string): string => {
    const byPlatform = {
      linux: `ps -p ${oldTorPid} -o comm=`,
      darwin: `ps -c -p ${oldTorPid} -o comm=`
    }
    return byPlatform[process.platform]
  }

  protected readonly spawnTor = async (timeoutMs): Promise<void> => {
    return await new Promise((resolve, reject) => {
      this.process = child_process.spawn(
        this.torPath,
        [
          '--SocksPort',
          this.socksPort,
          ...(this.httpTunnelPort ? ['--HTTPTunnelPort', this.httpTunnelPort] : []),
          '--ControlPort',
          this.controlPort.toString(),
          '--PidFile',
          this.torPidPath,
          '--DataDirectory',
          this.torDataDirectory,
          '--HashedControlPassword',
          this.torHashedPassword
        ],
        this.options
      )

      const timeout = setTimeout(() => {
        reject(new Error(`Timeout of ${timeoutMs / 1000} while waiting for tor to bootstrap`))
      }, timeoutMs)

      this.process.stdout.on('data', data => {
        log(data.toString())
        const regexp = /Bootstrapped 100%/
        if (regexp.test(data.toString())) {
          clearTimeout(timeout)
          resolve()
        }
      })
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
  }): Promise<string> {
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
    const hashedPassword = child_process.execSync(`${this.torPath} --quiet --hash-password ${password}`, { env: this.options.env })
    this.torPassword = password
    this.torHashedPassword = hashedPassword.toString().trim()
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
        reject(new Error('TOR: Process is not initalized.'))
      }
      this.process?.on('close', () => {
        resolve()
      })
      this.process?.on('error', () => {
        reject(new Error('TOR: Something went wrong with killing tor process'))
      })
      this.process?.kill()
    })
}
