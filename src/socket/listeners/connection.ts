import { EventTypesServer } from '../constants'
import { CertsData, IChannelInfo, IMessage } from '../../common/types'
import IOProxy from '../IOProxy'
import PeerId from 'peer-id'
import logger from '../../logger'
const log = logger('socket')

export const connections = (io, ioProxy: IOProxy) => {
  io.on(EventTypesServer.CONNECTION, socket => {
    log('websocket connected')
    socket.on(EventTypesServer.CLOSE, async () => {
      await ioProxy.closeAll()
    })
    socket.on(EventTypesServer.SUBSCRIBE_FOR_TOPIC, async (peerId: string, channelData: IChannelInfo) => {
      await ioProxy.subscribeForTopic(peerId, channelData)
    })
    socket.on(
      EventTypesServer.SEND_MESSAGE,
      async (peerId: string, { channelAddress, message }: { channelAddress: string, message: IMessage }) => {
        await ioProxy.sendMessage(peerId, channelAddress, message)
      }
    )
    socket.on(EventTypesServer.GET_PUBLIC_CHANNELS, async (peerId: string) => {
      await ioProxy.updateChannels(peerId)
    })
    socket.on(EventTypesServer.FETCH_ALL_MESSAGES, async (peerId: string, channelAddress: string) => {
      await ioProxy.loadAllMessages(peerId, channelAddress)
    })
    socket.on(
      EventTypesServer.ADD_USER,
      async (peerId: string, { publicKey, halfKey }: { publicKey: string, halfKey: string }) => {
        await ioProxy.addUser(peerId, publicKey, halfKey)
      }
    )
    socket.on(EventTypesServer.GET_AVAILABLE_USERS, async (peerId: string) => {
      await ioProxy.getAvailableUsers(peerId)
    })
    socket.on(
      EventTypesServer.INITIALIZE_CONVERSATION,
      async (peerId: string, { address, encryptedPhrase }: { address: string, encryptedPhrase: string }) => {
        await ioProxy.initializeConversation(peerId, address, encryptedPhrase)
      }
    )
    socket.on(EventTypesServer.GET_PRIVATE_CONVERSATIONS, async (peerId: string) => {
      await ioProxy.getPrivateConversations(peerId)
    })
    socket.on(
      EventTypesServer.SEND_DIRECT_MESSAGE,
      async (peerId: string, { channelAddress, message }: { channelAddress: string, message: string }) => {
        await ioProxy.sendDirectMessage(peerId, channelAddress, message)
      }
    )
    socket.on(
      EventTypesServer.SUBSCRIBE_FOR_DIRECT_MESSAGE_THREAD,
      async (peerId: string, channelAddress: string) => {
        await ioProxy.subscribeForDirectMessageThread(peerId, channelAddress)
      }
    )
    socket.on(EventTypesServer.SUBSCRIBE_FOR_ALL_CONVERSATIONS, async (peerId: string, conversations: string[]) => {
      await ioProxy.subscribeForAllConversations(peerId, conversations)
    })
    socket.on(
      EventTypesServer.ASK_FOR_MESSAGES,
      async ({ peerId, channelAddress, ids, communityId }: { peerId: string, channelAddress: string, ids: string[], communityId: string }) => {
        await ioProxy.askForMessages(peerId, channelAddress, ids, communityId)
      }
    )
    socket.on(EventTypesServer.REGISTER_USER_CERTIFICATE, async (serviceAddress: string, userCsr: string, id: string) => {
      log(`Registering user certificate (${id}) on ${serviceAddress}`)
      await ioProxy.registerUserCertificate(serviceAddress, userCsr, id)
    })
    socket.on(EventTypesServer.REGISTER_OWNER_CERTIFICATE, async (communityId: string, userCsr: string, dataFromPerms: {
      certificate: string
      privKey: string
    }) => {
      log(`Registering owner certificate (${communityId})`)
      await ioProxy.registerOwnerCertificate(communityId, userCsr, dataFromPerms)
    })
    socket.on(EventTypesServer.SAVE_CERTIFICATE, async (peerId: string, certificate: string) => {
      log(`Saving user certificate (${peerId})`)
      await ioProxy.saveCertificate(peerId, certificate)
    })
    socket.on(EventTypesServer.SAVE_OWNER_CERTIFICATE, async (communityId: string, peerId: string, certificate: string, dataFromPerms: {
      certificate: string
      privKey: string
    }) => {
      log(`Saving owner certificate (${peerId}), community: ${communityId}`)
      await ioProxy.saveOwnerCertificate(communityId, peerId, certificate, dataFromPerms)
    })
    socket.on(EventTypesServer.CREATE_COMMUNITY, async (payload: {id: string, rootCertString: string, rootCertKey: string}, certs: CertsData) => {
      log(`Creating community ${payload.id}`)
      await ioProxy.createCommunity(payload.id, certs, payload.rootCertString, payload.rootCertKey)
    })

    socket.on(EventTypesServer.LAUNCH_COMMUNITY, async (id: string, peerId: PeerId.JSONPeerId, hiddenServiceKey: {address: string, privateKey: string}, peers: string[], certs: CertsData) => {
      log(`Launching community ${id} for ${peerId.id}`)
      await ioProxy.launchCommunity(id, peerId, hiddenServiceKey, peers, certs)
    })
    socket.on(EventTypesServer.LAUNCH_REGISTRAR, async (id: string, peerId: string, rootCertString: string, rootKeyString: string, hiddenServicePrivKey?: string, port?: number) => {
      log(`Launching registrar for community ${id}, user ${peerId}`)
      await ioProxy.launchRegistrar(id, peerId, rootCertString, rootKeyString, hiddenServicePrivKey, port)
    })
    socket.on(EventTypesServer.CREATE_NETWORK, async (communityId: string) => {
      log(`Creating network for community ${communityId}`)
      await ioProxy.createNetwork(communityId)
    })
  })
}
