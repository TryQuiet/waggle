import path from "path"
import { createTmpDir } from "../testUtils"
import { NodeWithTor } from "./nodes"
import inquirer from 'inquirer'
import fp from 'find-free-port'
import yargs from 'yargs'
import debug from 'debug'
import { tmpdir } from "os"
const log = Object.assign(debug('localTest'), {
  error: debug('localTest:err')
})


const tmpDir = createTmpDir()

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

const launchNode = async (i: number) => {
  const torDir = path.join(tmpDir.name, `tor${i}`)
  const tmpAppDataPath = path.join(tmpDir.name, `.zbayTmp${i}`)
  const [port] = await fp(7788 + i)
  const [socksProxyPort] = await fp(1234 + i)
  const [torControlPort] = await fp(9051 + i)
  const node = new NodeWithTor(undefined, undefined, undefined, port, socksProxyPort, torControlPort, port, torDir, undefined, false, false, tmpAppDataPath)
  await node.init()
  node.storage.setName(`Node${i}`)
  log(`${node.storage.name} joined network`)
  return node
}

const main = async () => {
  const passed = []
  const failed = []
  process.on('SIGINT', function() {
    log("Caught interrupt signal")
    log('Nodes passed:', passed)
    log('Nodes failed', failed)
    log(`Removing tmp dir: ${tmpDir.name}`)
    tmpDir.removeCallback()
    process.exit(1)
  })
  let nodesCount = 1
  let nodes: NodeKeyValue = {}
  const maxReplicationTimePerNode = 15 // seconds

  setInterval(async () => {
    let nodeData = new NodeData()
    nodeData.checked = false
    nodeData.testPassed = false
    nodeData.node = await launchNode(nodesCount)
    nodeData.timeLaunched = new Date()
    nodes[nodesCount] = nodeData
    nodesCount += 1
  }, 30_000)

  setInterval(async () => {
    for (const nodeData of Object.values(nodes)) {
      if (nodeData.checked === true) {
        continue
      }
      const timeSinceLaunch = (new Date().getTime() - nodeData.timeLaunched.getTime()) / 1000
      const currentNodeName = nodeData.node.storage.name
      // log(`${currentNodeName} time since launch: ${timeSinceLaunch}s`)
      if (timeSinceLaunch > maxReplicationTimePerNode) {
        nodeData.checked = true
        const replicationTime = nodeData.node.storage.replicationTime
        if (!replicationTime) {
          nodeData.testPassed = false
          failed.push(nodeData)
          log.error(`Test failed for ${currentNodeName}`)
        } else {
          nodeData.testPassed = true
          nodeData.actualReplicationTime = replicationTime
          passed.push(nodeData)
          log(`Test passed for ${currentNodeName}. Replication time: ${nodeData.actualReplicationTime}`)
        }
      }
    }
  }, 2000)
}

main().catch((error)=> {
  console.error('Something went wrong', error)
})
