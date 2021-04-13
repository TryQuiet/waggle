export enum EventTypesServer {
  CONNECTION = 'connection',
  DISCONNECTED = 'disconnect',
  MESSAGE = 'message',
  ERROR = 'error',
  SEND_MESSAGE = 'sendMessage',
  FETCH_ALL_MESSAGES = 'fetchAllMessages',
  SUBSCRIBE_FOR_TOPIC = 'subscribeForTopic',
  ADD_TOR_SERVICE = 'addTorService',
  REMOVE_TOR_SERVICE = 'removeTorService',
  GET_PUBLIC_CHANNELS = 'getPublicChannels',
  INITIALIZE_CONVERSATION = 'initializeConversation',
  GET_AVAILABLE_USERS = 'getAvailableUsers',
  GET_PRIVATE_CONVERSATIONS = 'getPrivateConversations',
  SEND_PRIVATE_MESSAGE = 'sendPrivateMessage',
  ADD_USER = 'addUser'
}