import { IChannelInfo, IMessage } from "./common/types"
import CommunitiesManager from "./community"
import { ConnectionsManager } from "./libp2p/connectionsManager"
import { EventTypesResponse } from "./socket/constantsReponse"
import { Storage } from "./storage"
import debug from 'debug'

const log = Object.assign(debug('waggle:iohandler'), {
  error: debug('waggle:iohandler:err')
})

export default class IOProxy {
  io: any
  connectionsManager: ConnectionsManager
  communities: CommunitiesManager

  constructor(connectionsManager: ConnectionsManager) {
    this.connectionsManager = connectionsManager
    this.io = connectionsManager.io
    this.communities = new CommunitiesManager(connectionsManager)
  }

  public getStorage(peerId: string): Storage {
    return this.communities.getStorage(peerId)
  }

  public subscribeForTopic = async (peerId: string, channelData: IChannelInfo) => {
    console.log('subscribeForTopic')
    await this.getStorage(peerId).subscribeForChannel(channelData.address, channelData)
  }

  public updateChannels = async (peerId) => {
    await this.getStorage(peerId).updateChannels()
  }

  public askForMessages = async (peerId, channelAddress: string, ids: string[]) => {
    await this.getStorage(peerId).askForMessages(channelAddress, ids)
  }

  public loadAllMessages = async (peerId, channelAddress: string) => {
    this.getStorage(peerId).loadAllChannelMessages(channelAddress)
  }

  public saveCertificate = async (peerId, certificate: string) => {
    await this.getStorage(peerId).saveCertificate(certificate)
  }

  // public sendPeerId = () => {
  //   const payload = this.peerId?.toB58String()
  //   this.io.emit(EventTypesResponse.SEND_PEER_ID, payload)
  // }

  public sendMessage = async (
    peerId: string,
    channelAddress: string,
    messagePayload: IMessage
  ): Promise<void> => {
    const { id, type, signature, createdAt, message, pubKey } = messagePayload
    const messageToSend = {
      id,
      type,
      signature,
      createdAt,
      message,
      channelId: channelAddress,
      pubKey
    }
    await this.getStorage(peerId).sendMessage(channelAddress, messageToSend)
  }

  // DMs

  public addUser = async (
    peerId: string,
    publicKey: string,
    halfKey: string
  ): Promise<void> => {
    log(`CONNECTIONS MANAGER: addUser - publicKey ${publicKey} and halfKey ${halfKey}`)
    await this.getStorage(peerId).addUser(publicKey, halfKey)
  }

  public initializeConversation = async (
    peerId: string,
    address: string,
    encryptedPhrase: string
  ): Promise<void> => {
    log(`INSIDE WAGGLE: ${encryptedPhrase}`)
    await this.getStorage(peerId).initializeConversation(address, encryptedPhrase)
  }

  public getAvailableUsers = async (peerId: string): Promise<void> => {
    await this.getStorage(peerId).getAvailableUsers()
  }

  public getPrivateConversations = async (peerId: string): Promise<void> => {
    await this.getStorage(peerId).getPrivateConversations()
  }

  public sendDirectMessage = async (
    peerId: string, 
    channelAddress: string,
    messagePayload: string
  ): Promise<void> => {
    await this.getStorage(peerId).sendDirectMessage(channelAddress, messagePayload)
  }

  public subscribeForDirectMessageThread = async (peerId: string, address: string): Promise<void> => {
    await this.getStorage(peerId).subscribeForDirectMessageThread(address)
  }

  public subscribeForAllConversations = async (peerId: string, conversations: string[]): Promise<void> => {
    await this.getStorage(peerId).subscribeForAllConversations(conversations)
  }

  public registerUserCertificate = async (serviceAddress: string, userCsr: string) => {
    const response = await this.connectionsManager.sendCertificateRegistrationRequest(serviceAddress, userCsr)
    switch (response.status) {
      case 200:
        break
      case 403:
        this.emitCertificateRegistrationError('Username already taken.')
        return
      default:
        this.emitCertificateRegistrationError('Registering username failed.')
        return
    }
    const certificate: string = await response.json()
    this.io.emit(EventTypesResponse.SEND_USER_CERTIFICATE, certificate)
  }

  public emitCertificateRegistrationError(message: string) {
    this.io.emit(EventTypesResponse.CERTIFICATE_REGISTRATION_ERROR, message)
  }
}