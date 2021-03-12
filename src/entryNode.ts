import { Tor } from './torManager'
import { DataServer } from './socket/DataServer'
import { ConnectionsManager } from './libp2p/connectionsManager'
import initListeners from './socket/listeners/'
import * as path from 'path'
import * as os from 'os'
import fs from 'fs'
import PeerId from 'peer-id'
import inquirer from 'inquirer'


const main = async () => {
  const torPath = `${process.cwd()}/tor/tor`
  const settingsPath = `${process.cwd()}/tor/torrc`
  const pathDevLib = path.join.apply(null, [process.cwd(), 'tor'])
  const tor = new Tor({
    torPath,
    settingsPath,
    options: {
      env: {
        LD_LIBRARY_PATH: pathDevLib,
        HOME: os.homedir()
      }
    }
  })
  await tor.init()
  let service1
  try {
    service1 = await tor.getServiceAddress(7788)
  } catch (e) {
    service1 = await tor.addOnion({ virtPort: 7788, targetPort: 7788, privKey: process.env.HIDDEN_SERVICE_SECRET })
  }
  console.log('service1', service1)

  const dataServer = new DataServer()
  dataServer.listen()
  const peerId = fs.readFileSync('entryNodePeerId.json')
  const parsedId = JSON.parse(peerId.toString()) as PeerId.JSONPeerId
  const peerIdRestored = await PeerId.createFromJSON(parsedId)
  const connectonsManager = new ConnectionsManager({
    port: 7788,
    host: service1,
    agentHost: 'localhost',
    agentPort: 9050
  })
  const node = await connectonsManager.initializeNode(peerIdRestored)

  console.log(node, 'node')

  initListeners(dataServer.io, connectonsManager)
}

async function askWhatToDo(connectonsManager) {
  const questions = [
    {
      type: 'rawlist',
      name: 'what',
      message: 'What you need?',
      choices: ['Print channels', 'Add channel', 'IPFS.id()', 'ipfs.swarm.peers'],
    },
  ]
  const answer = await inquirer.prompt(questions)
  if (answer.what === 'Print channels') {
    if (!connectonsManager.storage.channels) {
      console.log('Nobody connected yet!')
      return
    }
    console.log(connectonsManager.storage.channels.all)
  } else if (answer.what === 'Add channel') {
    await connectonsManager.storage.createChannel(Math.floor(Math.random() * 10e12).toString(32))
  } else if (answer.what === 'IPFS.id()') {
    let ipfsId = await connectonsManager.storage.ipfs.id()
    console.log(ipfsId.id)
  } else if (answer.what === 'ipfs.swarm.peers') {
    console.log(await connectonsManager.storage.ipfs.swarm.peers())
  } else if (answer.what === 'p2p node id') {
    // console.log(connectonsManager.storage.)
  }
  process.nextTick(() => askWhatToDo(connectonsManager))

}

main()
