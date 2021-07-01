import { createRootCA, createUserCsr } from "@zbayapp/identity"
import { SocksProxyAgent } from "socks-proxy-agent"
import { CertificateRegistration } from "."
import { Time } from "pkijs"
import { createMinConnectionManager, createTmpDir, spawnTorProcess, TmpDir, tmpZbayDirPath } from "../testUtils"
import { fetchAbsolute } from "../utils"
import fetch from 'node-fetch'
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

async function registerUserTest(csr: string): Promise<Response> {
  const socksProxyAgent = new SocksProxyAgent({ port: 9050, host: 'localhost' })
  const options = {
    method: 'POST',
    body: JSON.stringify({'data': csr}),
    headers: { 'Content-Type': 'application/json' },
    agent: () => {
      return socksProxyAgent
    }
  }
  return await fetchAbsolute(fetch)('http://4avghtoehep5ebjngfqk5b43jolkiyyedfcvvq4ouzdnughodzoglzad.onion:7789')('/register', options)
}


describe('Registration service', () => {
  it('generates and certificate for a new user', async () => {  // TODO
    const certRoot = await createRootCA(new Time({ type: 1, value: new Date() }), new Time({ type: 1, value: new Date(2030, 1, 1) }), 'testRootCA')
    const user = await createUserCsr({
      zbayNickname: 'userName',
      commonName: 'nqnw4kc4c77fb47lk52m5l57h4tcxceo7ymxekfn7yh5m66t4jv2olad.onion',
      peerId: 'Qmf3ySkYqLET9xtAtDzvAr5Pp3egK1H3C5iJAZm1SpLEp6'
    })
    const manager = createMinConnectionManager()
    const tor = await spawnTorProcess(tmpAppDataPath)
    await tor.init()
    await manager.initializeNode()
    await manager.initStorage()
    const registrationService = await manager.setupRegistrationService(
      tor, 
      'ED25519-V3:iEp140DpauUp45TBx/IdjDm3/kinRPjwmsrXaGC9j39zhFsjI3MHdaiuIHJf3GiivF+hAi/5SUzYq4SzvbKzWQ==', 
      {certificate: certRoot.rootCertString, privKey: certRoot.rootKeyString}
    )
    const response = await registerUserTest(user.userCsr)
    console.log('RESPONSE', await response.json())
    await registrationService.stop()
    await tor.kill()
  })
})