import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git'
import * as child_process from 'child_process'
import MockDate from 'mockdate'

enum Type {
  BARE,
  STANDARD
}

interface IRepos {
  git: SimpleGit,
  type: Type,
  parentId: string | null
}

export class Git {
  httpServerPort: number
  process: child_process.ChildProcessWithoutNullStreams | null = null
  git: SimpleGit
  repoPathBare: string
  repoPathStandard: string
  gitRepos: Map<string, IRepos>
  constructor(port: number) {
    this.httpServerPort = port
    this.gitRepos = new Map()
  }

  public init = async () => {
    const targetPath = `${os.homedir()}/ZbayChannels/`
    this.createPaths([targetPath])
    const dirs = fs.readdirSync(targetPath).filter(f => fs.statSync(path.join(targetPath, f)).isDirectory())
    if (dirs.length > 0) {
      for (const dir of dirs) {
        const options = {
          baseDir: `${targetPath}${dir}/`,
          binary: 'git',
          maxConcurrent: 6
        }
        const git = simpleGit(options)
        this.gitRepos.set(`${dir}`, {
          git,
          type: dir.includes('bare') ? Type.BARE : Type.STANDARD,
          parentId: null
        })
      }
    }
    return this.gitRepos
  }

  private createPaths = (paths: string[]) => {
    for (const path of paths)
    if (!fs.existsSync(path)){
      fs.mkdirSync(path, { recursive: true });
    }
  }

  private addRepo = async (repoPath: string, bare: boolean, repoName: string) => {
    const options = {
      baseDir: repoPath,
      binary: 'git',
      maxConcurrent: 6
    }
    const git = simpleGit(options)
    if (bare) {
      await git.init(bare)
      await git.updateServerInfo()
      fs.renameSync(`${repoPath}/hooks/post-update.sample`, `${repoPath}/hooks/post-update`)
    } else {
      await git.clone(`file://${os.homedir()}/ZbayChannels/${repoName}-bare`, `${os.homedir()}/ZbayChannels/${repoName}-standard`)
    }
    this.gitRepos.set(bare ? `${repoName}-bare` : `${repoName}-standard`, {
      git: git,
      type: bare ? Type.BARE : Type.STANDARD,
      parentId: null
    })
    return this.gitRepos.get(bare ? `${repoName}-bare` : `${repoName}-standard`).git
  }

  public createRepository = async (repoName: string) => {
    const repoPathBare = `${os.homedir()}/ZbayChannels/${repoName}-bare/`
    const repoPathStandard = `${os.homedir()}/ZbayChannels/${repoName}-standard/`
    this.createPaths([repoPathBare, repoPathStandard])
    const bareRepo = await this.addRepo(repoPathBare, true, repoName)
    const standardRepo = await this.addRepo(repoPathStandard, false, repoName)
    return {
      bareRepo,
      standardRepo
    }
  }

  public pullChanges = async (id: string, onionAddress: string, repoName: string, port: string) => {
    const targetRepo = this.gitRepos.get(id)
    const pull = async (onionAddress, repoName, port, git: SimpleGit) => {
      await git.addConfig('http.proxy', 'socks5h://127.0.0.1:9050')
      await git.pull(`http://${onionAddress}:${port}/${repoName}-bare/`, 'master')
      await git.push('origin', 'master')
    }
    if (!targetRepo) {
      try {
        const { standardRepo } = await this.createRepository(`${repoName}`)
        await pull(onionAddress, repoName, port, standardRepo)
      } catch (e) {
        throw new Error(e)
      }
    } else {
      try {
        await pull(onionAddress, repoName, port, targetRepo.git)
      } catch (e) {
        throw new Error(e)
      }
    }
  }

  public getParentMessage = async (id: string) => {
    const targetFilePath = `${os.homedir()}/ZbayChannels/${id}/`
    let parentId = this.gitRepos.get(id).parentId
    const dir = fs.readdirSync(targetFilePath).filter(el => !el.includes('git'))
    if (!parentId && dir.length > 0) {
      const sortFiles = dir.sort((a, b) => {
        return fs.statSync(targetFilePath + b).mtime.getTime() - fs.statSync(targetFilePath + a).mtime.getTime()
      })
      parentId = sortFiles[0]
      this.gitRepos.get(id).parentId = parentId
    }
    return parentId
  }

  public addCommit = async (id: string, messageId: string, messagePayload: Buffer, date: number, parentId: string | null): Promise<void> => {
    try {
      const targetRepo = this.gitRepos.get(id)
      await targetRepo.git.addConfig('user.name', 'zbay')
      await targetRepo.git.addConfig('user.email', 'zbay@unknown.world')
      await targetRepo.git.env('GIT_COMMITTER_DATE', `"${new Date(date).toUTCString()}"`)
      const targetFilePath = `${os.homedir()}/ZbayChannels/${id}/${messageId}`
      fs.writeFileSync(targetFilePath, messagePayload)
      const dateObj = new Date(date)
      fs.utimesSync(targetFilePath, dateObj, dateObj)
      await targetRepo.git.add(`${os.homedir()}/ZbayChannels/${id}/*`)
      await targetRepo.git.commit(`messageId: ${messageId} parentId: ${parentId}`, null, { '--date': new Date(date).toUTCString() })
      targetRepo.parentId = messageId
      await targetRepo.git.push('origin', 'master')
    } catch (e) { 
      console.log(e)
    }
  }

  public startHttpServer = (): Promise<void> => 
  new Promise((resolve, reject) => {
    if (this.process) {
      throw new Error('Already initialized')
    }
    this.process = child_process.spawn('npx', ['http-server', `${os.homedir()}/ZbayChannels/`, `-p ${this.httpServerPort}`])
    const id = setTimeout(() => {
      this.process?.kill()
      reject('Process timeout')
    }, 20000)
    this.process.stdout.on('data', (data: Buffer) => {
      console.log(data.toString())
      if (data.toString().includes(`${this.httpServerPort}`)) {
        clearTimeout(id)
        resolve()
      }
    })
  })
}

export const sleep = (time = 1000) =>
  new Promise<void>(resolve => {
    setTimeout(() => {
      resolve()
    }, time)
  })


const main = async () => {

const timestamp = '20190927 10:00:00'

const changeTime = async () => {
  return new Promise((resolve, reject) => {
    child_process.exec(`/usr/bin/date -s '2014-12-25 12:34:56'`, (err, stdout, stderr) => {
      if (err || stderr) {
        console.error(err)
        console.log(stderr)
        reject(err)
      } else {
        console.log(stdout)
        console.log(`Successfully set the system's datetime to ${stdout}`)
        resolve('ok')
      }
    })
  })
}

  const content = 'halalala5'
  const git = new Git(8521)
  const test = Buffer.from('adamek4')
  MockDate.set(1607079584362)
  // Date = Timeshift.Date
  //Timeshift.setTime(1607079584362)
  // const date = Date.now().toString()
  // console.log(date, 'date')
  // const commitDate = new Date('1607079584362')
  const testing = new Date().toString()
  // console.log(testing, 'testing')
  // const testdupa = await changeTime()
  // console.log(testdupa, 'testdupa')
  await git.startHttpServer()
  // await git.pullChanges('testing-02.12.2020-standard', 'pbl6nhssnih5s6cvpbuv3kibdhj2izmdthdmvwzpydxxw7l4yzsh3kqd.onion', 'testing-02.12.2020', '8521')
  // await sleep(5000)
  await git.init()
  await git.createRepository('testing-02.12.2020')
  await git.createRepository('testing-02.12.2021')

  await sleep(20000)
  // const parentId = await git.getParentMessage('testing-02.12.2020-standard')
  // const { standardRepo, bareRepo } = await git.createRepository('testing-02.12.2020')
  await git.addCommit('testing-02.12.2020-standard', 'adamek4', test, 1607079584362, null)
  await sleep(5000)
  await git.addCommit('testing-02.12.2021-standard', 'adamek4', test, 1607079584362, null)
  console.log('finish')
  // const content = 'halalala5'
  // const git = new Git(8521)
  // const test = Buffer.from('alala')
  // const date = new Date()
  // await git.startHttpServer()
  // await git.init()
  // await git.pullChanges('testing-02.12.2020-standard', '4mje2pdhgvhmefugd5yhaet5eof2mlws6hh5qmn6ph4ns6z7njjv74ad.onion', 'testing-02.12.2020', '8521')
  // await sleep(5000)
  // const { standardRepo, bareRepo } = await git.createRepository('testing-02.12.2020')
  // await git.addCommit('testing-02.12.2020-standard', '1234567890', test, date, null)
  // date.setHours(date.getHours() + 2)
  // await sleep(5000)
  // const date2 = new Date(date.getTime())
  // await git.addCommit('testing-02.12.2020-standard', '1111111111', test, date2, '1234567890')
  // await sleep(5000)
  // date.setHours(date.getHours() + 1)
  // const date1 = new Date(date.getTime())
  // await git.addCommit('testing-02.12.2020-standard', '2222222222', test, date1, '1111111111')
  // git.init()
  // const parentId = await git.getParentMessage('testing-02.12.2020-standard')
  // console.log('parenId', parentId)
  // const test = await git.init()
  // console.log('tesing here', test)
  // await git.startHttpServer()
  // const { standardRepo, bareRepo } = await git.createRepository('testing-02.12.2020', 'channel-address')
  // fs.writeFileSync(`${os.homedir()}/ZbayChannels/testing-02.12.2020/myfile3.txt`, content)
  // await standardRepo.add(`${os.homedir()}/ZbayChannels/testing-02.12.2020/*`)
  // await standardRepo.commit('hey3')
  // await standardRepo.push('origin', 'master')
  // await git.pullChanges('papap', '4mje2pdhgvhmefugd5yhaet5eof2mlws6hh5qmn6ph4ns6z7njjv74ad.onion', 'testing-02.12.2020-bare', '8521')
  // console.log(standardRepo.log())
  // console.log(bareRepo.log())
}

main()
