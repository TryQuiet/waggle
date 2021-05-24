import * as child_process from 'child_process'
import * as fs from 'fs'
import path from 'path'
import { TorControl } from './torControl'
import { ZBAY_DIR_PATH } from '../constants'
import { sleep } from './../sleep'
import { dir } from 'console'
interface IService {
  virtPort: number
  address: string
}
interface IConstructor {
  torPath: string
  options?: child_process.SpawnOptionsWithoutStdio
  appDataPath?: string
  controlPort?: number
}
export class Tor {
  process: child_process.ChildProcessWithoutNullStreams | any = null
  torPath: string
  options?: child_process.SpawnOptionsWithoutStdio
  services: Map<number, IService>
  torControl: TorControl
  appDataPath: string
  controlPort: string
  torDataDirectory: string
  torPidPath: string
  constructor({ torPath, options, appDataPath, controlPort }: IConstructor) {
    this.torPath = torPath
    this.options = options
    this.services = new Map()
    this.torControl = new TorControl({ port: controlPort, host: 'localhost' })
    this.appDataPath = appDataPath
    this.controlPort = controlPort.toString()
  }

  public init = async () => {
    return new Promise((resolve, reject) => {
      if (this.process) {
        throw new Error('Tor already initialized')
      }

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

      if (oldTorPid) {
        child_process.exec(`ps -p ${oldTorPid} -o comm=`, (err, stdout, stderr) => {
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

  public async setSocksPort(port: number): Promise<void> {
    await this.torControl.setConf(`SocksPort="${port}"`)
  }

  // public async setHttpTunnelPort(port: number): Promise<void> {
  //   await this.torControl.setConf(`HTTPTunnelPort="${port}"`)
  // }

  private spawnTor =(resolve) => {
    this.process = child_process.spawn(
      this.torPath,
      [
        // '--SocksPort',
        // this.socksPort,
        '--ControlPort',
        this.controlPort,
        '--PidFile',
        this.torPidPath,
        '--DataDirectory',
        this.torDataDirectory
      ],
      this.options
    )
    this.process.stdout.on('data', data => {
      console.log(data.toString())
      const regexp = /Bootstrapped 100%/
      const bootstrapped = data.toString('utf8').match(/Bootstrapped (\d+)/)
      if (regexp.test(data.toString())) resolve()
    })
  }

  public async addOnion({
    virtPort,
    targetPort,
    privKey
  }: {
    virtPort: number
    targetPort: number
    privKey: string
  }): Promise<string> {
    const status = await this.torControl.addOnion(
      `${privKey} Flags=Detach Port=${virtPort},127.0.0.1:${targetPort}`
    )
    const onionAddress = status.messages[0].replace('250-ServiceID=', '')
    this.services.set(virtPort, {
      virtPort,
      address: onionAddress
    })
    return onionAddress
  }

  public async deleteOnion(serviceId: string): Promise<void> {
    await this.torControl.delOnion(serviceId)
  }

  public async addNewService(
    virtPort: number,
    targetPort: number
  ): Promise<{ onionAddress: string; privateKey: string }> {
    const status = await this.torControl.addOnion(
      `NEW:BEST Flags=Detach Port=${virtPort},127.0.0.1:${targetPort}`
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
        console.log('before closing tor')
        resolve()
      })
      this.process?.kill()
    })
}
