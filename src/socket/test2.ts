import { sleep } from "../sleep"

var socket = require('socket.io-client')('http://localhost:4677')

const main = async () => {
  await sleep(5000)
  console.log('emmiting')
  socket.emit('subscribeForTopic', 'test-123')
  await sleep(10000)
  socket.emit('subscribeForTopic', 'test-888')
  await sleep(10000)
  socket.emit('subscribeForTopic', 'test-666')
  await sleep(10000)
  let counter = 0
  let counter2 = 0
  let counter3 = 0
  const interval = setInterval(async () => {
    socket.emit('sendMessage', { channelAddress: 'test-123', message: `${counter.toString()} test-123` })
    counter++
    if (counter === 100) {
      clearInterval(interval)
    }
  }, 100)
  await sleep(1500)
  const interval2 = setInterval(async () => {
    socket.emit('sendMessage', { channelAddress: 'test-888', message: `${counter2.toString()} test-888` })
    counter2++
    if (counter2 === 100) {
      clearInterval(interval2)
    }
  }, 100)
  const interval3 = setInterval(async () => {
    socket.emit('sendMessage', { channelAddress: 'test-666', message: `${counter3.toString()} test-666` })
    counter3++
    if (counter2 === 100) {
      clearInterval(interval3)
    }
  }, 100)
}

socket.on('disconnect', function(){
  console.log('disconected')
})

main()