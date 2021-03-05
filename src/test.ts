import { Tor } from 'tor-manager'
import { DataServer } from './socket/DataServer'
import { ConnectionsManager } from './libp2p/connectionsManager'
import initListeners from './socket/listeners/'
import * as path from 'path'
import * as os from 'os'
import fs from 'fs'
import inquirer from 'inquirer'
import PeerId from 'peer-id'

const main = async () => {
  const torPath = `${process.cwd()}/tor/tor`
  fs.createReadStream(`${process.cwd()}/tor/torrc.template`).pipe(fs.createWriteStream(`${process.cwd()}/tor/torrc`));
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
  //aa
  let service1
  try {
    // const staticOnionAddress = `PT0gZWQyNTUxOXYxLXNlY3JldDogdHlwZTAgPT0AAADQZeSBmBABj5X+4zo98d+zOfFEygXVYajYaTzthFtLa4muclClSkstifM4SQsaJlFkJN//FZsBfMSLTDPubgCP`
    service1 = await tor.getServiceAddress(7788)
  } catch (e) {
    service1 = await (await tor.addService({ port: 7788, createDefault: false })).address
  }
  console.log('service1', service1)

  const dataServer = new DataServer()
  dataServer.listen()
  //const peerIdFile = process.env.HIDDEN_SERVICE_SECRET ? 'peerId2.json' : 'peerId1.json'
  //const peerId2 = fs.readFileSync(peerIdFile)
  //const parsedId2 = JSON.parse(peerId2.toString()) as PeerId.JSONPeerId
  //const peerId2Restored = await PeerId.createFromJSON(parsedId2)
  const connectonsManager = new ConnectionsManager({
    port: 7788,
    host: service1,
    agentHost: 'localhost',
    agentPort: 9050
  })
  //const node = await connectonsManager.initializeNode(peerId2Restored, true)
  const node = await connectonsManager.initializeNode()
  
  console.log(node, 'node')

  initListeners(dataServer.io, connectonsManager)

  process.nextTick(() => askWhatToDo(connectonsManager))
}

async function askWhatToDo(connectonsManager) {
  const questions = [
    {
      type: 'rawlist',
      name: 'what',
      message: 'What you need?',
      choices: ['Print channels', 'Add channel'],
    },
  ]
  const answer = await inquirer.prompt(questions)
  if (answer.what === 'Print channels') {
    console.log(connectonsManager.storage.channels.all)
  } else if (answer.what === 'Add channel') {
    await connectonsManager.storage.createChannel(Math.floor(Math.random() * 10e12).toString(32))
  }
  process.nextTick(() => askWhatToDo(connectonsManager))

}

main()
