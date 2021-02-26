/*jslint node:true*/

'use strict'

var net = require('net')
var EventEmitter = require('events').EventEmitter

interface IOpts {
  port?: number
  host?: string
  password?: string
  persistent?: boolean
  path?: string
}

type Cb = (err: any, status: any) => void

class TorControl {
  opts: IOpts = {}
  private connect: (params: any, cb: any) => { any: any }
  private connection: any
  private disconnect: any
  private isPersistent: any
  private setPersistent: any
  private eventEmitter: any = new EventEmitter()
  private sendCommand: any = (command: any, cb: any, keepConnection: any) => {
    var self = this,
      tryDisconnect = function (callback: any) {
        if (keepConnection || self.isPersistent() || !self.connection) {
          return callback()
        }
        return self.disconnect(callback)
      }
    return this.connect(null, function (err: any, connection: any) {
      if (err) {
        return cb(err)
      }
      connection.once('data', function (data: any) {
        return tryDisconnect(function () {
          var messages = [],
            arr,
            i
          if (cb) {
            data = data.toString()
            console.log(`this is shit ${/250/.test(data)}`)
            if (/250/.test(data)) {
              console.log({ data })

              arr = data.split(/\r?\n/)

              for (i = 0; i < arr.length; i += 1) {
                if (arr[i] !== '') {
                  var message = arr[i]
                  messages.push(message)
                }
              }
              return cb(null, {
                code: 250,
                messages: messages,
                data: data
              })
              
            }
              return cb(new Error(data), {
                code: parseInt(data.substr(0, 3), 10),
                message: data.substr(4),
                data: data
              })
          }
        })
      })
      connection.write(command + '\r\n')
    })
  }
  constructor(opts: IOpts = {}) {
    var self = this

    opts = opts || {}

    if (!opts.hasOwnProperty('path')) {
      opts.port = opts.port || 9051
      opts.host = opts.host || 'localhost'
    }

    opts.password = opts.password || ''
    if (!opts.hasOwnProperty('persistent')) {
      opts.persistent = false
    }

    this.connect = function connectTorControl(params, cb) {
      params = params || opts

      if (this.connection) {
        if (cb) {
          return cb(null, this.connection)
        }
        return
      }

      if (!params.hasOwnProperty('path')) {
        if (opts.hasOwnProperty('path')) {
          params.path = opts.path
        } else {
          params.host = params.host || opts.host
          params.port = params.port || opts.port
        }
      }

      this.connection = net.connect(params)

      //Handling connection errors
      this.connection.once('error', function (err: any) {
        if (cb) {
          cb(new Error('Error connecting to control port: ' + err))
        }
      })

      // piping events
      this.connection.on('data', (data: any) => {
        self.eventEmitter.emit('data', data)
      })
      this.connection.on('end', () => {
        self.connection = null
        self.eventEmitter.emit('end')
      })

      if (cb) {
        this.connection.once('data', function (data: any) {
          data = data.toString()
          if (data.substr(0, 3) === '250') {
            return cb(null, self.connection)
          }
          return cb(new Error('Authentication failed with message: ' + data))
        })
      }

      this.connection.write('AUTHENTICATE "' + (params.password || opts.password) + '"\r\n') // Chapter 3.5
      return this
    }

    this.disconnect = function disconnectTorControl(cb: any, force: any) {
      if (!this.connection) {
        if (cb) {
          return cb()
        }
        return
      }
      if (cb) {
        this.connection.once('end', function () {
          return cb()
        })
      }
      if (force) {
        return this.connection.end()
      }
      this.connection.write('QUIT\r\n')
      return this
    }

    this.isPersistent = function isTorControlPersistent() {
      return !!opts.persistent
    }
    this.setPersistent = function setTorControlPersistent(value: any) {
      opts.persistent = !!value
      return this
    }
  }

  // Config
  public setConf(request: string, cb: any) {
    return this.sendCommand('SETCONF ' + request, cb)
  }
  public resetConf(request: string, cb: any) {
    // Chapter 3.2
    return this.sendCommand('RESETCONF ' + request, cb)
  }
  public getConf(request: string, cb: any) {
    // Chapter 3.3
    return this.sendCommand('GETCONF ' + request, cb)
  }
  public saveConf(request: string, cb: any) {
    // Chapter 3.6
    return this.sendCommand('SAVECONF ' + request, cb)
  }
}

export { TorControl }
