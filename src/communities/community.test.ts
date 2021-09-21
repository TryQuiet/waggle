import CommunitiesManager from './manager'
import { ConnectionsManager } from '../libp2p/connectionsManager'
import { createMinConnectionManager, createTmpDir, tmpZbayDirPath } from '../testUtils'
import PeerId from 'peer-id'
import { getPorts } from '../utils'
import { createCertificatesTestHelper } from '../libp2p/tests/client-server'
jest.setTimeout(100_000)

describe('Community manager', () => {
  let connectionsManager: ConnectionsManager
  let manager: CommunitiesManager

  beforeEach(async () => {
    const appDataPath = createTmpDir()
    const ports = await getPorts()
    connectionsManager = createMinConnectionManager({
      env: { appDataPath: tmpZbayDirPath(appDataPath.name) },
      torControlPort: ports.controlPort
    })
    await connectionsManager.init()
  })

  afterEach(async () => {
    manager && await manager.closeStorages()
    await connectionsManager.tor.kill()
  })

  it.skip('creates new community', async () => {
    manager = new CommunitiesManager(connectionsManager)
    expect(manager.communities.size).toBe(0)
    const pems = await createCertificatesTestHelper('address1.onion', 'address2.onion')
    const certs = {
      cert: pems.userCert,
      key: pems.userKey,
      ca: [pems.ca]
    }
    const communityData = await manager.create(certs)
    expect(manager.communities.size).toBe(1)
    expect(manager.communities.has(communityData.peerId.id)).toBeTruthy()
  })

  it.skip('launches community', async () => {
    manager = new CommunitiesManager(connectionsManager)
    expect(manager.communities.size).toBe(0)
    const peerId = await PeerId.create()
    const pems = await createCertificatesTestHelper('address1.onion', 'address2.onion')
    const certs = {
      cert: pems.userCert,
      key: pems.userKey,
      ca: [pems.ca]
    }
    const localAddress = await manager.launch(
      peerId.toJSON(),
      'ED25519-V3:YKbZb2pGbMt44qunoxvrxCKenRomAI9b/HkPB5mWgU9wIm7wqS+43t0yLiCmjSu+FW4f9qFW91c4r6BAsXS9Lg==',
      ['peeraddress'],
      certs
      )
      expect(localAddress).toContain(peerId.toB58String())
      expect(manager.communities.size).toBe(1)
    })
    
    it('launches storage', async () => {
      console.log('asdf')
      manager = new CommunitiesManager(connectionsManager)


      const pi = {
        id: "QmeUmy6UtuEs91TH6bKnfuU1Yvp63CkZJWm624MjBEBazW",
        privKey: "CAASpwkwggSjAgEAAoIBAQCvr8VY7MvdFc3GvIdrNCwFns554yuUrb6fPE/giU1Yels0yYXxcpQIgf0c9uuAoaBcJx6YvvkdPqEAgKwGUeauzuyGHxcVK3lYbF/GtioiMyKnisuhHJ7zz8rMDg2lr4yhG/eNvENL5fTbD6QN17vDQvAvzrO4RKBKWOXDc02NYIJuN0uKGs/9GtXY2YEBG8kR4SVH3dWPLK3T91P1VzRtqhGDvm2K0NRhLzedwDJLDu/T59MDRshMuOy8gtMNeQXHJuRuVSL4KRcugihK6u79kMGDtdlYz7cuEk/aXHlutDYR5LYIewncfxtfcBSEZT/xXOIcSwFUhM8QzZtIetilAgMBAAECggEAC+AnyOEIzsMAi+SGitqV9zNK5bZTZdNwxTbAd38QeWCb9a+BnFaQZxrSTzjppmJGgrQqP0z5bd6j53LLLgovO7XFCzPizY2IwE9jEf2ST4mBWC3rodJbdEOhg7WXepGpQeKwEyacre63ZG9kOYNRr9tAfRrNzzDkXOIxdcq/fUTiGlYUQsoRYf9waWFgIrBrh0z6p/0cfSIdHA+qt1W8Rrhk+46xsABws3i9x4sZ304ROEPn5//HxMOqSW3GFx/OaTqWq6jafXdLolyYr+tTYsQnpEJ+qY2drd108B+9KaxtWxBPGLkqZKuCe+SdBQKrtXI6C6q7T2FoDrXBiKFoaQKBgQDc3pU64Fl8mdXDf/Z/2Jf98kipEI9FPiwUON9GXg0H4SVdAoy4ixE4nBSBrihFb3Q8+EKL0EFG5eH9h/n5NWKvjGEwo2UAyxkxWhdqKDTHiYraZuJBj221yfJfWyFuXYCNA8hRBtNNBn17/dzy5ewX/xQWBZtEUXQ5u+sHvIt0MwKBgQDLoWvTW5toMAW2atAxlKlXy4r3IfBXjf3P6pCrSzcCzL1atIdG0LOp4BDQgHlycJWy1rn0zKO97o7euvINdFn5tZJG5/maIAOy4XaztDhysAiJloUQVEnk/U/49U9PaAXVPAOJWmbzZawlQJKALn+WMuUVt2hBkhsiGJC8F2FnxwKBgAICNDE44Rd0/rCsdT1sZtV0YpzG/caPbi8w5TbqnAu6THCwGT+EZD+zi6wyPUOEY/Y5+8Dxv+Y5KPj5R5iwl5kpGakrkzuSnUQJobThcLlv0sdxsBUQjNreX0nmtkMerpCZvDSgb0OAD5wVDvFWjfMZ6sDYhDT22Ku9vcFwQYRpAoGAS9NsJ2QxVnaraeYUaKIG/R5aPPRyXugM32NlQ6PadDxxNlmLFh+ZB2TcXge5MZgi5ll3HWUmhA9VPDM49zGgX4/xTF4NYAsT1YSHgxtU+b/7LeDS4+W/Lnn1UatnQRZnNaQHXRpAw9nUZHrLEtg9wlxpWdDWDbSuTd//5Up/hvkCgYEA0S8FQTfsfbt0781nSwNJReP7Va8/J2ajpHOrpxn9/mkplg9AZ8PFkYXg++eJIS9r3/jexNLBMdXdDFakjX3sxxfAejnveE8IcG5wJgmEo+fRZYe5azU3kiwZ4UeqH5dc7swU40yEEWVBvJiRbsZVAHRytAp35ryTvQboUB5JVNM=",
        pubKey: "CAASpgIwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCvr8VY7MvdFc3GvIdrNCwFns554yuUrb6fPE/giU1Yels0yYXxcpQIgf0c9uuAoaBcJx6YvvkdPqEAgKwGUeauzuyGHxcVK3lYbF/GtioiMyKnisuhHJ7zz8rMDg2lr4yhG/eNvENL5fTbD6QN17vDQvAvzrO4RKBKWOXDc02NYIJuN0uKGs/9GtXY2YEBG8kR4SVH3dWPLK3T91P1VzRtqhGDvm2K0NRhLzedwDJLDu/T59MDRshMuOy8gtMNeQXHJuRuVSL4KRcugihK6u79kMGDtdlYz7cuEk/aXHlutDYR5LYIewncfxtfcBSEZT/xXOIcSwFUhM8QzZtIetilAgMBAAE="
      }

      const peerId = await PeerId.createFromPrivKey(pi.privKey)

      const certs = {
        cert: "MIICDjCCAbMCBgF8B0KUEzAKBggqhkjOPQQDAjASMRAwDgYDVQQDEwdaYmF5IENBMB4XDTEwMTIyODEwMTAxMFoXDTMwMTIyODEwMTAxMFowSTFHMEUGA1UEAxM+ZHZyd2dpZ3Z0dGV4NHZ1MnlmY2RjYm5sd2lwb2NocmhlN3k0bHJnYWxnZmlyNjV2ZmE2eHl3cWQub25pb24wWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAAQLXxAJm3KzVcWnTePM4kHRGTTb0fpU+6FlMZo9pOd82+BZDvtjhNIZuxGn5l3dskWq11mH/kZaU6ZOf/5SR9pSo4HCMIG/MAkGA1UdEwQCMAAwCwYDVR0PBAQDAgAOMB0GA1UdJQQWMBQGCCsGAQUFBwMCBggrBgEFBQcDATAvBgkqhkiG9w0BCQwEIgQgpBYUExrLoon/Ex0C714k84BQg3v419F38/xWSsq3E8IwFgYKKwYBBAGDjBsCAQQIEwZmZ2ZnZmcwPQYJKwYBAgEPAwEBBDATLlFtZVVteTZVdHVFczkxVEg2YktuZnVVMVl2cDYzQ2taSldtNjI0TWpCRUJhelcwCgYIKoZIzj0EAwIDSQAwRgIhAO1Bn6C3+uocCxbaFLjEVbX/EiKl6K2J9alP/aCiF1/xAiEA0MVyzgGyYyUFZK5uCfsLIcYWnnpSoU/hC8GzMbxPDTk=",
        key: "MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQgIET3A1SEBwmzoATYTCBZgxxdSLuoh1QB4kAVVj3fA7+gCgYIKoZIzj0DAQehRANCAAQLXxAJm3KzVcWnTePM4kHRGTTb0fpU+6FlMZo9pOd82+BZDvtjhNIZuxGn5l3dskWq11mH/kZaU6ZOf/5SR9pS",
        ca: ["MIIBTDCB8wIBATAKBggqhkjOPQQDAjASMRAwDgYDVQQDEwdaYmF5IENBMB4XDTEwMTIyODEwMTAxMFoXDTMwMTIyODEwMTAxMFowEjEQMA4GA1UEAxMHWmJheSBDQTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABILMBoj/3IH+mcNWDr+Jjek24s0pvFEp3hJ0Oygf0p9eBFIbT6ODpx6SylnNXoxarpx7YdKGKyGgcT+IKDPEmayjPzA9MA8GA1UdEwQIMAYBAf8CAQMwCwYDVR0PBAQDAgAGMB0GA1UdJQQWMBQGCCsGAQUFBwMCBggrBgEFBQcDATAKBggqhkjOPQQDAgNIADBFAiEA7PBLDBETru9nzayWWUvF0aXSOeqlCBqnEIa0LOQqkrcCIAU/wko9NKiLnSatLxWymK5HfnwjPoxvhrAgCoGksNBT"]
      }
        
      const localAddress = await manager.launch(
        peerId.toJSON(),
        'ED25519-V3:4J907UUS2QNo8dWqLvys8qfQ3wg2mMjWk2owvVXD/myjQjqJzjYn8mrjzeFU2mrf/yA5bQKS7r2HsjRpqt93Eg==',
        ['peeraddress'],
        certs
        )
      })
    })
