import path from "path"
import { createTmpDir } from "../testUtils"
import { NodeWithTor } from "./nodes"
import fp from 'find-free-port'
import debug from 'debug'
import Table from 'cli-table'
const log = Object.assign(debug('localTest'), {
  error: debug('localTest:err')
})

// Run entry node with messages
// Run second node connecting to entry node
// Check if the second node replicated all messages within a set time range

const tmpDir = createTmpDir()

const addressBootstrapMultiaddrs =  `/dns4/b3blzzfntawunjjyi5nfgx32zj3uyj3glvblb6ye3ndbvdjuc7r6btqd.onion/tcp/`
const peerIdBootstrapMultiaddrs = '/ws/p2p/Qmc159udVDVd87CAxQjgcYW6ZgBXZHYr4gjpfwJB8M3iZg'
let testBootstrapMultiaddrs: string
const testHiddenKey = 'ED25519-V3:kKyIk91pWMhSVEuJG9fnMH4w06ohY8lG2ePz8P6crGFEhRD2W2ahiWj0d/VceSIJn6TZ1DVi4XJ3z4V2txgP1Q=='

interface NodeKeyValue {
  [key: number]: NodeData
}

class NodeData {
  checked: boolean = false
  testPassed: boolean = false
  node: any
  timeLaunched: Date
  actualReplicationTime?: number
}

const launchNode = async (i: number, hiddenServiceSecret?: string, createMessages: boolean = false, peerIdFilename?: string, useSnapshot?: boolean) => {
  const torDir = path.join(tmpDir.name, `tor${i}`)
  const tmpAppDataPath = path.join(tmpDir.name, `.zbayTmp${i}`)
  const [port] = await fp(7788 + i)
  if (hiddenServiceSecret) {
    testBootstrapMultiaddrs = addressBootstrapMultiaddrs.concat(port.toString(), peerIdBootstrapMultiaddrs)
  }
  const [socksProxyPort] = await fp(1234 + i)
  const [torControlPort] = await fp(9051 + i)
  const node = new NodeWithTor(undefined, undefined, peerIdFilename, port, socksProxyPort, torControlPort, port, torDir, hiddenServiceSecret, createMessages, useSnapshot, tmpAppDataPath, [testBootstrapMultiaddrs])
  await node.init()
  node.storage.setName(`Node${i}`)
  log(`${node.storage.name} joined network`)
  return node
}

const displayResults = (nodes: NodeKeyValue) => {
  const table = new Table({head: ['Node name', 'Time of replication', 'Test passed']})
  for (const nodeData of Object.values(nodes)) {
    table.push([nodeData.node.storage.name, nodeData.actualReplicationTime, nodeData.testPassed])
  }
  
  console.log(table.toString())
  if (Object.values(nodes).filter(node => !node.testPassed).length > 0) {
    log.error('Test failed')
    process.exit(1)
  } else {
    log('Test passed')
    process.exit(0)
  }
}

const displayTestAssertions = (replicationThreshold, dbEntriesCount) => {
  const table = new Table({head: ['Time threshold', 'Messages (db entries) count']})
  table.push([replicationThreshold, dbEntriesCount])
  console.log(table.toString())
}

const runTest = async () => {
  const nodesCount = 3 // Nodes count except the entry node. TODO: should be taken from the input
  process.on('SIGINT', function() {
    log("Caught interrupt signal")
    log(`Removing tmp dir: ${tmpDir.name}`)
    tmpDir.removeCallback()
    process.exit(1)
  })
  let nodesCounter = 1
  let nodes: NodeKeyValue = {}
  const maxReplicationTimePerNode = 100 // seconds

  // Launch entry node
  await launchNode(0, testHiddenKey, true, 'localTestPeerId.json', false)

  // Launch other nodes
  while (nodesCounter <= nodesCount) {
    let nodeData = new NodeData()
    nodeData.checked = false
    nodeData.testPassed = false
    nodeData.node = await launchNode(nodesCounter)
    nodeData.timeLaunched = new Date()
    nodes[nodesCounter] = nodeData
    nodesCounter += 1
  }

  const testIntervalId = setInterval(async () => {
    const nodesReplicationFinished = Object.values(nodes).filter(nodeData => nodeData.node.storage.replicationTime !== undefined)
    // Get nodes that finished replicating
    for (const nodeData of nodesReplicationFinished) {
      if (nodeData.checked === true) {
        continue
      } else {
        nodeData.actualReplicationTime = nodeData.node.storage.replicationTime
        nodeData.testPassed = nodeData.actualReplicationTime <= maxReplicationTimePerNode
        nodeData.checked = true
        log(`Test ${nodeData.testPassed ? 'passed' : 'failed'} for ${nodeData.node.storage.name}. Replication time: ${nodeData.actualReplicationTime}`)
      }
    }
    if (nodesReplicationFinished.length === nodesCount) {
      log('All nodes finished replicating')
      clearInterval(testIntervalId)
      log(`Removing tmp dir: ${tmpDir.name}`)
      tmpDir.removeCallback()
      displayTestAssertions(maxReplicationTimePerNode, 1000)
      displayResults(nodes)
    }
  }, 5000)
}

runTest().catch((error)=> {
  console.error('Something went wrong', error)
})
