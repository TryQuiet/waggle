import { EventTypesServer } from '../constants'
import { ConnectionsManager } from '../../libp2p/connectionsManager'


export const connections = (io, connectionsManager: ConnectionsManager) => {
  io.on(EventTypesServer.CONNECTION, socket => {
    console.log('--------------- IO CONNECTION')
    socket.on(EventTypesServer.SUBSCRIBE_FOR_TOPIC, async (channelAddress: string) => {
      await connectionsManager.subscribeForTopic(channelAddress, io)
    })
    socket.on(EventTypesServer.SEND_MESSAGE, async ({ channelAddress, message }) => {
      console.log('event MESSAGE')
      await connectionsManager.sendMessage(channelAddress, io, message)
    })
    socket.on('gimmeData', async (channelInfo) => {  // Test, remove later
      console.log('received something: ', channelInfo)
      await connectionsManager.gimmeData(channelInfo)
    })
    socket.once(EventTypesServer.GET_PUBLIC_CHANNELS, async () => {
      await connectionsManager.updateChannels(io)
    })
    // socket.on(EventTypesServer.ADD_TOR_SERVICE, async (port: number) => {
    //   try {
    //     const service = await tor.addService({ port })
    //     socket.emit(EventTypesResponse.RESPONSE_ADD_TOR_SERVICE, service)
    //   } catch (err) {
    //     console.error(err)
    //     socket.emit(EventTypesServer.ERROR, {
    //       type: EventTypesServer.ADD_TOR_SERVICE,
    //       err
    //     })
    //   }
    // })
    // socket.on(EventTypesServer.REMOVE_TOR_SERVICE, async (port: number) => {
    //   try {
    //     await tor.killService({ port })
    //     socket.emit(EventTypesResponse.RESPONSE_REMOVE_TOR_SERVICE, { port })
    //   } catch (err) {
    //     console.error(err)
    //     socket.emit(EventTypesServer.ERROR, {
    //       type: EventTypesServer.REMOVE_TOR_SERVICE,
    //       err
    //     })
    //   }
    // })
  })
}
