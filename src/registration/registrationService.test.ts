import { CertificateRegistration } from "."
import { createMinConnectionManager, createTmpDir, spawnTorProcess, TmpDir, tmpZbayDirPath } from "../testUtils"
jest.setTimeout(50_000)
let tmpDir: TmpDir
let tmpAppDataPath: string

beforeEach(() => {
  jest.clearAllMocks()
  tmpDir = createTmpDir()
  tmpAppDataPath = tmpZbayDirPath(tmpDir.name)
})

afterEach(async () => {
  tmpDir.removeCallback()
})


describe('Registration service', () => {
  it('generates and certificate for a new user', async () => {  // TODO
    const manager = createMinConnectionManager()
    const tor = await spawnTorProcess(tmpAppDataPath)
    await tor.init()
    const certRegister = new CertificateRegistration(
      'ED25519-V3:iEp140DpauUp45TBx/IdjDm3/kinRPjwmsrXaGC9j39zhFsjI3MHdaiuIHJf3GiivF+hAi/5SUzYq4SzvbKzWQ==', 
      tor, 
      manager
    )
    await certRegister.init()
    await certRegister.listen()
    await certRegister.stop()
    await tor.kill()
  })
})