import path from "path"
import { createTmpDir } from "../testUtils"
import { NodeWithTor } from "./nodes"

const tmpDir = createTmpDir()
const torDir1 = path.join(tmpDir.name, 'tor1')
const torDir2 = path.join(tmpDir.name, 'tor2')
const tmpAppDataPath1 = path.join(tmpDir.name, '.zbayTmp1')
const tmpAppDataPath2 = path.join(tmpDir.name, '.zbayTmp2')

const hiddenSecret = 'ED25519-V3:+OQSh718QNMfTV+jpsO1moEjSRVnHvPOlEhS1WKdGGkP0OPwMG0iXWx6FJ9liCsbhJGFwLg/I13v6qhB8KVv5Q=='
const bootstrapMultiaddrs = ['/dns4/ix2oumqrtjaupt53l6cqpk6ct6iaa5guconwgtvgdk2v3i5wjiyehryd.onion/tcp/7788/ws/p2p/QmRbkBkhTt2DbLMF8kAaf1oxpfKQuEfLKFzVCDzQhabwkw']
  
const main = async () => {
  // Node that generates snapshot
  const port1 = 7788
  const node1 = new NodeWithTor(undefined, undefined, 'localEntryNodePeerId.json', port1, 1234, 9051, port1, torDir1, hiddenSecret, {
    createSnapshot: true, 
    useSnapshot: true, 
    messagesCount: 1000
    },
   tmpAppDataPath1, 
   bootstrapMultiaddrs
   )
  await node1.init()

  // Node that retrieves snapshot
  const port2 = 7789
  const node2 = new NodeWithTor(undefined, undefined, undefined, port2, 4321, 9052, port2, torDir2, undefined, {
    createSnapshot: false, 
    useSnapshot: true, 
    messagesCount: 1000
    },
    tmpAppDataPath2,
    bootstrapMultiaddrs
    )
  await node2.init()
}

main().catch((error)=> {
  console.error('Something went wrong', error)
})