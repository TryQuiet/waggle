import { DataServer } from './socket/DataServer'

const main = async () => {
  const dataServer = new DataServer()
  await dataServer.initTor()
  await dataServer.initGit()
  await dataServer.initializeLibp2p()
  await dataServer.listen()
  // dataServer.listen()
}
main()

export default DataServer