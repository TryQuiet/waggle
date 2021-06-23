import { EventTypesServer } from '../constants'
import { IMessage } from '../../storage/storage'
import { EventTypesResponse } from '../constantsReponse'

export const message = (socket: SocketIO.Server, message) => {
  socket.emit(EventTypesServer.MESSAGE, message)
}

export const directMessage = (socket: SocketIO.Server, message) => {
  socket.emit(EventTypesServer.DIRECT_MESSAGE, message)
}

export const loadAllMessages = (
  socket: SocketIO.Server,
  messages: IMessage[],
  channelAddress: string
) => {
  if (messages.length === 0) {
    return
  }
  socket.emit(EventTypesResponse.RESPONSE_FETCH_ALL_MESSAGES, {
    channelAddress,
    messages
  })
}

export const sendIdsToZbay = (socket: SocketIO.Server, ids: string[], channelAddress: string) => {
  if (ids.length === 0) {
    return
  }
  console.log(`IDS are ${ids}`)
  socket.emit(EventTypesResponse.SEND_IDS, {
    channelAddress,
    ids
  })
}

export const loadAllDirectMessages = (socket: SocketIO.Server, messages: string[], channelAddress: string) => {
  if (messages.length === 0) {
    return
  }
  socket.emit(EventTypesResponse.RESPONSE_FETCH_ALL_DIRECT_MESSAGES, {
    channelAddress,
    messages
  })
}
