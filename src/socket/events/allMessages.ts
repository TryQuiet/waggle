import { IMessage } from '../../storage/storage'
import { EventTypesResponse } from '../constantsReponse'

export const loadAllMessages = (socket: any, messages: IMessage[], channelAddress: string) => {
  console.log(`load ${messages.length} messages for ${channelAddress}`)
  socket.emit(EventTypesResponse.RESPONSE_FETCH_ALL_MESSAGES, {
    channelAddress,
    messages
  })
}
