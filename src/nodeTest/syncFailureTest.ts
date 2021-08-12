import path from "path"
import { createTmpDir } from "../testUtils"
import { NodeWithTor } from "./nodes"
import inquirer from 'inquirer'
import fp from 'find-free-port'
import yargs from 'yargs'
import debug from 'debug'
const log = Object.assign(debug('localTest'), {
  error: debug('localTest:err')
})


const tmpDir = createTmpDir()
  
const main = async () => {
  const nodesCount = 1
  const min = Math.ceil(1);
  const max = Math.floor(nodesCount)

  let nodes = {}
  for (let i = 1; i <= nodesCount; i++) {
    const torDir = path.join(tmpDir.name, `tor${i}`)
    const tmpAppDataPath = path.join(tmpDir.name, `.zbayTmp${i}`)
    const port = await fp(7788 + i)
    const socksProxyPort = await fp(1234 + i)
    const torControlPort = await fp(9051 + i)
    const node = new NodeWithTor(undefined, undefined, undefined, port, socksProxyPort, torControlPort, port, torDir, undefined, false, tmpAppDataPath)
    await node.init()
    node.storage.setName(`Node${i}`)
    nodes[i] = node
  }
  
  let messagesCounter = 0
  setInterval(async () => {
    const nodeNumber = Math.floor(Math.random() * (max - min + 1)) + min
    log(`Sending message from node ${nodeNumber}`)
    await nodes[nodeNumber].storage.addMessage(`Message ${messagesCounter} from node ${nodeNumber}`)
    messagesCounter += 1
  }, 10_000)

  setInterval(() => {
    for (const node of Object.values(nodes)) {
      // @ts-expect-error
      log(`Saving snapshot of ${node.storage.name}`)
      // @ts-expect-error
      node.storage.saveSnapshotToFile()
    }
  }, 30_000)

  // TODO: proper usage of inquirer would be more useful
}

main().catch((error)=> {
  console.error('Something went wrong', error)
})
