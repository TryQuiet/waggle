import path from "path"
import { createTmpDir } from "../testUtils"
import { NodeWithTor, NodeWithoutTor, LocalNode } from "./nodes"
import fp from 'find-free-port'
import debug from 'debug'
import Table from 'cli-table'
import yargs, {Argv} from "yargs"
const log = Object.assign(debug('localTest'), {
  error: debug('localTest:err')
})
let argv = yargs.command('test', "Test replication", (yargs: Argv) => {
  return yargs.option('useTor', {
    describe: "Whether to use Tor or run waggle nodes on localhost",
    default: true,
    type: 'boolean'
  }).option('nodesCount', {
    describe: "How many nodes should be run in test (does not include entry node)",
    alias: 'n',
    type: 'number'
  }).option('timeThreshold', {
    describe: "Max time for each node complete replication (in seconds)",
    alias: 't',
    type: 'number'
  }).option('entriesCount', {
    describe: "Number of db entries",
    alias: 'e',
    type: 'number'
  })
  .demandOption(['nodesCount', 'timeThreshold', 'entriesCount'])
  .help()
}).argv

console.log(argv)

const tmpDir = createTmpDir()
const testTimeout = (argv.nodesCount + 1) * 1000
const addressBootstrapMultiaddrsTor =  `/dns4/b3blzzfntawunjjyi5nfgx32zj3uyj3glvblb6ye3ndbvdjuc7r6btqd.onion/tcp/`
const addressBootstrapMultiaddrsLocal = '/dns4/0.0.0.0/tcp/'
const peerIdBootstrapMultiaddrs = '/ws/p2p/Qmc159udVDVd87CAxQjgcYW6ZgBXZHYr4gjpfwJB8M3iZg'
const testHiddenKey = 'ED25519-V3:kKyIk91pWMhSVEuJG9fnMH4w06ohY8lG2ePz8P6crGFEhRD2W2ahiWj0d/VceSIJn6TZ1DVi4XJ3z4V2txgP1Q=='
let addressBootstrapMultiaddrs: string
let testBootstrapMultiaddrs: string

let NodeType: typeof LocalNode
if (argv.useTor) {
  NodeType = NodeWithTor
  addressBootstrapMultiaddrs = addressBootstrapMultiaddrsTor
} else {
  NodeType = NodeWithoutTor
  addressBootstrapMultiaddrs = addressBootstrapMultiaddrsLocal
}

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
  const node = new NodeType(
    undefined, 
    undefined, 
    peerIdFilename, 
    port, 
    socksProxyPort, 
    torControlPort, 
    port, 
    torDir, 
    hiddenServiceSecret, 
    {
      createSnapshot: createMessages, 
      useSnapshot, 
      messagesCount: argv.entriesCount
    },
    tmpAppDataPath, 
    [testBootstrapMultiaddrs]
  )
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
  displayTestSetup()
  console.log(table.toString())
  if (Object.values(nodes).filter(node => !node.testPassed).length > 0) {
    log.error('Test failed')
    process.exit(1)
  } else {
    log('Test passed')
    process.exit(0)
  }
}

const displayTestSetup = () => {
  const table = new Table({head: ['Time threshold', 'Messages (db entries) count', 'Test used Tor']})
  table.push([argv.timeThreshold, argv.entriesCount, argv.useTor])
  console.log(table.toString())
}

const runTest = async () => {
  // Run entry node with messages
  // Run second node connecting to entry node
  // Check if the second node replicated all messages within a set time range

  process.on('SIGINT', function() {
    log("Caught interrupt signal")
    log(`Removing tmp dir: ${tmpDir.name}`)
    tmpDir.removeCallback()
    process.exit(1)
  })
  const testStartTime = new Date().getTime()
  const nodesCount = Number(argv.nodesCount) // Nodes count except the entry node
  const maxReplicationTimePerNode = Number(argv.timeThreshold)
  // let nodesCounter = 1
  let nodes: NodeKeyValue = {}

  const initNode = async (noNumber: number) => {
    let nodeData = new NodeData()
    nodeData.checked = false
    nodeData.testPassed = false
    nodeData.node = await launchNode(noNumber)
    nodeData.timeLaunched = new Date()
    nodes[noNumber] = nodeData
  }

  // Launch entry node
  await launchNode(0, testHiddenKey, true, 'localTestPeerId.json', false)

  // Launch other nodes
  const numbers = [...Array(nodesCount + 1).keys()].splice(1)
  await Promise.all(numbers.map(initNode))

  // Checks
  const testIntervalId = setInterval(async () => {
    // const timeDiff = (new Date().getTime() - testStartTime) / 100
    // if (timeDiff > testTimeout) {
    //   log('timeout set:', testTimeout)
    //   log.error(`Timeout after ${timeDiff}`)
    //   // TODO: add more info (snapshots maybe?)
    // }
    const nodesReplicationFinished = Object.values(nodes).filter(nodeData => nodeData.node.storage.replicationTime !== undefined)
    if (nodesReplicationFinished.length === 0) return

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
      displayResults(nodes)
    }
  }, 5_000)
}

runTest().catch((error)=> {
  console.error('Something went wrong', error)
})
