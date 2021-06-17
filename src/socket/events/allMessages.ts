import { IMessage } from '../../common/types'
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

export const loadAllDirectMessages = (socket: any, messages: IMessage[], channelAddress: string) => {
  if (messages.length === 0) {
    return
  }
  socket.emit(EventTypesResponse.RESPONSE_FETCH_ALL_DIRECT_MESSAGES, {
    channelAddress,
    messages
  })
}
