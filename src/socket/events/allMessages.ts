import { Socket } from 'dgram'
import { IMessage } from '../../storage/storage'
import { EventTypesResponse } from '../constantsReponse'

export const loadAllMessages = (socket: any, messages: IMessage[], channelAddress: string) => {
  if (messages.length === 0) {
    return
  }
  socket.emit(EventTypesResponse.RESPONSE_FETCH_ALL_MESSAGES, {
    channelAddress,
    messages
  })
}

export const sendIdsToZbay = (socket: any, ids: string[], channelAddress: string) => {
  if (ids.length === 0) {
    return
  }
  socket.emit(EventTypesResponse.SEND_IDS, {
    channelAddress,
    ids
  })
}

export const loadAllDirectMessages = (socket, messages, channelAddress) => {
  if (messages.length === 0) {
    return
  }
  socket.emit(EventTypesResponse.RESPONSE_FETCH_ALL_DIRECT_MESSAGES, {
    channelAddress,
    messages
  })
}
