import Libp2p from 'libp2p'
import { SocksProxyAgent } from 'socks-proxy-agent'
import Mplex from 'libp2p-mplex'
import { NOISE } from 'libp2p-noise'
import KademliaDHT from 'libp2p-kad-dht'
import Gossipsub from 'libp2p-gossipsub'
import PeerId from 'peer-id'
import WebsocketsOverTor from './websocketOverTor'
import { Chat, IMessage, IMessageCommit } from './chat'
import Multiaddr from 'multiaddr'
import PubsubPeerDiscovery from 'libp2p-pubsub-peer-discovery'
import Bootstrap from 'libp2p-bootstrap'
import { sleep } from './sleep'
import Crypto from 'crypto'
import randomTimestamp from 'random-timestamps'
import { Git, State } from '../git/index'
import { gitP } from 'simple-git'
import multihashing from 'multihashing-async'
import crypto from 'crypto'
import { Request } from './config/protonsRequestMessages'
interface IConstructor {
  host: string
  port: number
  agentPort: number
  agentHost: string
}

interface IChat {
  send(message: IMessage): Promise<void>
  sendNewMergeCommit(message: IMessageCommit): Promise<void>
}

interface IChatRoom {
  chatInstance: IChat
}

interface IChannelSubscription {
  topic: string,
  channelAddress: string,
  git: Git
}

export class ConnectionsManager {
  host: string
  port: number
  agentHost: string
  agentPort: number
  socksProxyAgent: any
  libp2p: null | Libp2p
  chatRooms: Map<string, IChatRoom>
  localAddress: string | null
  onionAddressesBook: Map<string, string>
  constructor({ host, port, agentHost, agentPort }: IConstructor) {
    this.host = host,
    this.port = port,
    this.agentPort = agentPort,
    this.agentHost = agentHost
    this.chatRooms = new Map()
    this.onionAddressesBook = new Map()
    this.localAddress = null
    process.on('unhandledRejection', (error) => {
      console.error(error)
      throw error
    })
    process.on('SIGINT', function () {
      console.log('\nGracefully shutting down from SIGINT (Ctrl-C)')
      process.exit(0)
    })
  }
  private createAgent = async () => {
    this.socksProxyAgent = new SocksProxyAgent({ port: this.agentPort, host: this.agentHost })
  }
  public initializeNode = async (staticPeerId?) => {
    let peerId
    if (!staticPeerId) {
      peerId = await PeerId.create()
    } else {
      peerId = staticPeerId
    }
    const addrs = [
      `/dns4/${this.host}/tcp/${this.port}/ws`,
    ]

    const bootstrapMultiaddrs = [
      '/dns4/dn3qb4pjizmrmkrdjy7gbmxajjuosmxyojx6pilalr7c7vfz3ipekayd.onion/tcp/7766/ws/p2p/QmSFn9NnuvxFV9nfANCiCQvpNhZC3bnCcb4sCyAJSoBMF3'
    ]

    this.localAddress = `${addrs}/p2p/${peerId.toB58String()}`
    await this.createAgent()
    this.libp2p = await this.createBootstrapNode({ peerId, addrs, agent: this.socksProxyAgent, localAddr: this.localAddress, bootstrapMultiaddrsList: bootstrapMultiaddrs })
    await this.libp2p.start()
    this.libp2p.connectionManager.on('peer:connect', (connection) => {
      console.log('Connected to', connection.remotePeer.toB58String());
    });
    this.libp2p.connectionManager.on('peer:discovery', (peer) => {
      console.log(peer, 'peer discovery');
    })
    this.libp2p.connectionManager.on('peer:disconnect', (connection) => {
      console.log('Disconnected from', connection.remotePeer.toB58String());
    })
    return {
      address: `${addrs}/p2p/${peerId.toB58String()}`,
      peerId: peerId.toB58String()
    }
  }
  public subscribeForTopic = async ({ topic, channelAddress, git }: IChannelSubscription) => {
    const chat = new Chat(
      this.libp2p,
      topic,
      async ({ from, message }) => {
        let peerRepositoryOnionAddress = this.onionAddressesBook.get(from)
        if (!peerRepositoryOnionAddress) {
          const onionAddressKey = await this.createOnionPeerId(from)
          peerRepositoryOnionAddress = await this.libp2p._dht.get(onionAddressKey)
          this.onionAddressesBook.set(from, peerRepositoryOnionAddress)
        }
        const { git: targetGit, state: repoState } = git.gitRepos.get(channelAddress)
        if (repoState === State.LOCKED) return false
        if (message.type === Request.Type.SEND_MESSAGE) {
          const currentHEAD = await git.getCurrentHEAD(channelAddress)
          if (repoState === State.UNLOCKED && message.currentHEAD === currentHEAD) {
            await git.addCommit(message.channelId, message.id, message.raw, message.created, message.parentId)
          } else {
            git.gitRepos.get(channelAddress).state = State.LOCKED
            const mergeTime = await git.pullChanges(this.onionAddressesBook.get(from), channelAddress)
            const newHead = await git.getCurrentHEAD(channelAddress)
            const mergeResult = message.currentHEAD === newHead
            if (mergeResult) {
              git.gitRepos.get(channelAddress).state = State.UNLOCKED
            } else {
              const messagePayload = {
                created: new Date(mergeTime),
                parentId: (~~(Math.random() * 1e9)).toString(36) + Date.now(),
                channelId: channelAddress,
                currentHEAD: newHead
              }
              const chat = this.chatRooms.get(`${channelAddress}`)
              await chat.chatInstance.sendNewMergeCommit(messagePayload)
            }
          }
        } else {
          let head = await git.getCurrentHEAD(message.channelId)
          if (head !== message.currentHEAD) {
            git.gitRepos.get(message.channelId).state = State.LOCKED
            await git.pullChanges(this.onionAddressesBook.get(from), message.channelId, message.created)
            head = await git.getCurrentHEAD(message.channelId)
            if (head === message.currentHEAD) {
              console.log('success merged!!!')
              git.gitRepos.get(message.channelId).state = State.UNLOCKED
            }
          }
        }
        return false
      }
    )
    this.chatRooms.set(channelAddress, { chatInstance: chat })
  }
  public connectToNetwork = async (target: string) => {
    console.log(`Attempting to dial ${target}`)
    await this.libp2p.dial(target, { localAddr: this.localAddress, remoteAddr: new Multiaddr(target) })
  }

  public createOnionPeerId = async (peerId: string) => {
    const key = new TextEncoder().encode(`onion${peerId.substring(0, 10)}`)
    const digest = await multihashing(key, 'sha2-256')
    return digest
  }

  public publishOnionAddress = async (key, onionAddress): Promise<void> => {
    await this.libp2p._dht.put(key, onionAddress)
  }

  public getOnionAddress = async (key: string): Promise<string> => {
    const onionAddress = await this.libp2p._dht.get(key)
    return onionAddress.toString()
  }

  public startSendingMessages = async (channelAddress: string, git: Git): Promise<string> => {
    try {
      const chat = this.chatRooms.get(`${channelAddress}`)
      for(let i = 0; i <= 10; i++) {
        const { state } = git.gitRepos.get(channelAddress)
        if (state === State.LOCKED) continue
        const currentHEAD = await git.getCurrentHEAD(channelAddress)
        const randomBytes = Crypto.randomBytes(256)
        const timestamp = randomTimestamp()
        const messagePayload = {
          data: randomBytes,
          created: new Date(timestamp),
          parentId: (~~(Math.random() * 1e9)).toString(36) + Date.now(),
          channelId: channelAddress,
          currentHEAD
        }
        await chat.chatInstance.send(messagePayload)
        await sleep(2500)
      }
      return 'done'
      } catch (e) {
      console.error('ERROR', e)
      throw(e)
    }
  }

  public listenForInput = async (channelAddress: string): Promise<void> => {
    process.stdin.on('data', async (message) => {
      // Remove trailing newline
      message = message.slice(0, -1)
      const chat = this.chatRooms.get(`${channelAddress}`)
      // If there was a command, exit early
      try {
        // Publish the message
        console.log('ok')
        // await chat.chatInstance.send(message)
      } catch (err) {
        console.error('Could not publish chat', err)
      }
    })
  }
  private createBootstrapNode = ({ peerId, addrs, agent, localAddr, bootstrapMultiaddrsList }): Promise<Libp2p> => {
    return Libp2p.create({
      peerId,
      addresses: {
        listen: addrs
      },
      modules: {
        transport: [WebsocketsOverTor],
        // peerDiscovery: [Bootstrap],
        streamMuxer: [Mplex],
        connEncryption: [NOISE],
        dht: KademliaDHT,
        pubsub: Gossipsub
      },
      config: {
        peerDiscovery: {
          [Bootstrap.tag]: {
            enabled: true,
            list: bootstrapMultiaddrsList // provide array of multiaddrs
          }
        },
        relay: {
          enabled: true,
          hop: {
            enabled: true,
            active: false,
          },
        },
        dht: {
          enabled: true,
          randomWalk: {
            enabled: true,
          },
        },
        transport: {
          WebsocketsOverTor: {
            websocket: {
              agent
            },
            localAddr
          },
        },
      },
    })
  }
}