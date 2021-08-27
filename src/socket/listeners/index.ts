import { connections } from './connection'

const initListeners = (io, ioProxy) => {
  connections(io, ioProxy)
}

export default initListeners
