import path from "path"
import { createTmpDir } from "../testUtils"
import { NodeWithTor } from "./nodes"
import inquirer from 'inquirer'

const tmpDir = createTmpDir()  
  
const main = async () => {
  const nodesCount = 3
  const min = Math.ceil(1);
  const max = Math.floor(nodesCount)

  let nodes = {}
  for (let i = 1; i <= nodesCount; i++) {
    const torDir = path.join(tmpDir.name, `tor${i}`)
    const tmpAppDataPath = path.join(tmpDir.name, `.zbayTmp${i}`)
    const port = 7788 + i
    const node = new NodeWithTor(undefined, undefined, undefined, port, 1234 + i, 9051 + i, port, torDir, undefined, false, tmpAppDataPath)
    await node.init()
    node.storage.setName(`Node${i}`)
    nodes[i] = node
  }

  let messagesCounter = 0
  setInterval(async () => {
    const nodeNumber = Math.floor(Math.random() * (max - min)) + min
    console.log(`Sending message from node ${nodeNumber}`)
    await nodes[nodeNumber].storage.addMessage(`Message ${messagesCounter} from node ${nodeNumber}`)
    messagesCounter += 1
  }, 5000)

  // TODO: proper usage of inquirer would be more useful
}

main().catch((error)=> {
  console.error('Something went wrong', error)
})
