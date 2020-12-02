import * as fs from 'fs'
import * as os from 'os'
import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git'
import * as child_process from 'child_process'

enum Type {
  BARE,
  STANDARD
}

interface IRepos {
  channelAddress: string,
  git: SimpleGit,
  type: Type
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

  private createPaths = (paths: string[]) => {
    for (const path of paths)
    if (!fs.existsSync(path)){
      fs.mkdirSync(path, { recursive: true });
    }
  }

  private addRepo = async (repoPath: string, bare: boolean, id: string, repoName: string) => {
    const options = {
      baseDir: repoPath,
      binary: 'git',
      maxConcurrent: 6
    }
    const git = simpleGit(options)
    await git.init(bare)
    if (bare) {
      await git.updateServerInfo()
    } else {
      await git.addRemote('origin', `http://127.0.0.1:${this.httpServerPort}/${repoName}-bare`);
    }
    this.gitRepos.set(id, {
      channelAddress: 'id',
      git: git,
      type: bare ? Type.BARE : Type.STANDARD
    })
    return this.gitRepos.get(id).git
  }

  public createRepository = async (repoName: string) => {
    const repoPathBare = `${os.homedir()}/ZbayChannels/${repoName}-bare/`
    const repoPathStandard = `${os.homedir()}/ZbayChannels/${repoName}/`
    this.createPaths([repoPathBare, repoPathStandard])
    const bareRepo = await this.addRepo(repoPathBare, true, 'test-id', repoName)
    const standardRepo = await this.addRepo(repoPathStandard, false, 'test-id', repoName)
    return {
      bareRepo,
      standardRepo
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
      if (data.includes(`${this.httpServerPort}`)) {
        clearTimeout(id)
        resolve()
      }
    })
  })
}

const main = async () => {
  const content = 'halalala5'
  const git = new Git(8521)
  await git.startHttpServer()
  const { standardRepo, bareRepo } = await git.createRepository('testing-02.12.2020')
  fs.writeFileSync(`${os.homedir()}/ZbayChannels/testing-02.12.2020/myfile3.txt`, content)
  await standardRepo.add(`${os.homedir()}/ZbayChannels/testing-02.12.2020/*`)
  await standardRepo.commit('hey3')
  await standardRepo.push('origin', 'master')
  // console.log(standardRepo.log())
  // console.log(bareRepo.log())
}

main()
