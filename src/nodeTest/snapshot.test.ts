import path from "path"
import { createTmpDir } from "../testUtils"
import { NodeWithTor } from "./nodes"
jest.setTimeout(300_000)

let torDir1
let torDir2
let tmpAppDataPath1
let tmpAppDataPath2
const hiddenSecret = 'ED25519-V3:+OQSh718QNMfTV+jpsO1moEjSRVnHvPOlEhS1WKdGGkP0OPwMG0iXWx6FJ9liCsbhJGFwLg/I13v6qhB8KVv5Q=='

beforeEach(() => {
  const tmpDir = createTmpDir()
  torDir1 = path.join(tmpDir.name, 'tor1')
  torDir2 = path.join(tmpDir.name, 'tor2')
  tmpAppDataPath1 = path.join(tmpDir.name, '.zbayTmp1')
  tmpAppDataPath2 = path.join(tmpDir.name, '.zbayTmp2')
})

describe('Local network of peers', () => {
  it('Saves and loads snapshot', async () => {
    const node1 = new NodeWithTor(undefined, undefined, 'localEntryNodePeerId.json', 7788, 1234, 9051, 7795, torDir1, hiddenSecret, true, tmpAppDataPath1)
    await node1.init()
    console.log('INITIALIZED FIRST NODE')
    // const node2 = new NodeWithTor(undefined, undefined, undefined, 7789, 4321, 9052, 7796, torDir2, undefined, false, tmpAppDataPath2)
    // await node2.init()
  })
})