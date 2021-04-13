import { EventTypesServer } from '../constants'
import { ConnectionsManager } from '../../libp2p/connectionsManager'
import { IChannelInfo } from '../../storage/storage'

export const connections = (io, connectionsManager: ConnectionsManager) => {
  io.on(EventTypesServer.CONNECTION, socket => {
    console.log('websocket connected')
    socket.on(EventTypesServer.SUBSCRIBE_FOR_TOPIC, async (channelData: IChannelInfo) => {
      await connectionsManager.subscribeForTopic(channelData, io)
    })
    socket.on(EventTypesServer.SEND_MESSAGE, async ({ channelAddress, message }) => {
      await connectionsManager.sendMessage(channelAddress, io, message)
    })
    socket.on(EventTypesServer.GET_PUBLIC_CHANNELS, async () => {
      await connectionsManager.updateChannels(io)
    })
    socket.on(EventTypesServer.FETCH_ALL_MESSAGES, async (channelAddress: string) => {
      await connectionsManager.loadAllMessages(channelAddress, io)
    })
    // DIRECT MESSAGES
    // Add me to the list of waggle DMers
    socket.on(EventTypesServer.ADD_USER, async ({publicKey, halfKey}) => {
      await connectionsManager.addUser(publicKey, halfKey)
    })
    // For initializing messaging
    socket.on(EventTypesServer.INITIALIZE_CONVERSATION, async ({address, encryptedShit}) => {
      console.log('RECEived innitialize conversatuion in waggle ')
      await connectionsManager.initializeConversation(address, encryptedShit)
    })
    socket.on(EventTypesServer.GET_AVAILABLE_USERS, async () => {
      await connectionsManager.getAvailableUsers(io)
    })
    // For checking if there is message to me
    socket.on(EventTypesServer.GET_PRIVATE_CONVERSATIONS, async () => {
      console.log('ZBAY ASKED for private conversatiosn')
      await connectionsManager.getPrivateConversations(io)
    })
    // Just send message
    socket.on(EventTypesServer.SEND_PRIVATE_MESSAGE, async (channelAddress: string, message: string) => {
      await connectionsManager.sendPrivateMessage(channelAddress, message)
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
