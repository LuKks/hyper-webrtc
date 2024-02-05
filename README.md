# hyper-webrtc

WebRTC tools for the hypercore-protocol stack

```
npm i hyper-webrtc
```

Warning: This is experimental.

## Usage

Minimal example, Hypercore replication via WebRTC:

```js
swarm.on('connection', function (relay) {
  // Convert the relayed socket into a RTCDataChannel stream
  const stream = HyperWebRTC.from(relay)
  core.replicate(stream)
})

// Split RTC traffic from UDX traffic
const discoveryWeb = crypto.discoveryKey(core.discoveryKey)
swarm.join(discoveryWeb)
````

Another minimal example, DHT server and client:

```js
server.on('connection', function (relay) {
  // Convert the relayed socket into a RTCDataChannel stream
  const rtc = HyperWebRTC.from(relay)
})

const relay = dht.connect(server.publicKey)
const rtc = HyperWebRTC.from(relay) // Convert it here also
```

## DHT example

```js
import HyperWebRTC from 'hyper-webrtc'

import DHT from '@hyperswarm/dht-relay'
import Stream from '@hyperswarm/dht-relay/ws'

const node = createDHTRelay()
const server = node.createServer()

server.on('connection', function (relay) {
  const rtc = HyperWebRTC.from(relay)

  rtc.on('data', function (data) {
    console.log('Server-side received', data.toString())
  })
})

await server.listen()

const anotherNode = createDHTRelay()
const relay = anotherNode.connect(server.publicKey)
const rtc = HyperWebRTC.from(relay)

rtc.on('open', function () {
  console.log('Client-side opened')
})

rtc.write('Hello World!')

function createDHTRelay () {
  const socket = new WebSocket('wss://dht1-relay.leet.ar:49443')
  const dht = new DHT(new Stream(true, socket))
  return dht
}
```

## Hypercore example

```js
import HyperWebRTC from 'hyper-webrtc'

import DHT from '@hyperswarm/dht-relay'
import Stream from '@hyperswarm/dht-relay/ws'
import Hyperswarm from 'hyperswarm'

import Hypercore from 'hypercore'
import RAM from 'random-access-memory'
import crypto from 'hypercore-crypto'

await writer().then(reader)

async function writer () {
  const swarm = new Hyperswarm({ dht: createDHTRelay() })

  const core = new Hypercore(RAM)
  await core.append(['a', 'b', 'c'])

  swarm.on('connection', function (relay) {
    const stream = HyperWebRTC.from(relay)
    core.replicate(stream)
  })

  const discoveryWeb = crypto.discoveryKey(core.discoveryKey)
  const discovery = swarm.join(discoveryWeb)
  await discovery.flushed() // Just for testing, otherwise don't wait for this

  return core.id
}

async function reader (key) {
  const swarm = new Hyperswarm({ dht: createDHTRelay() })

  const core = new Hypercore(RAM, key)
  await core.ready()

  const done = core.findingPeers()

  swarm.on('connection', function (relay) {
    const stream = HyperWebRTC.from(relay)
    core.replicate(stream)
  })

  const discoveryWeb = crypto.discoveryKey(core.discoveryKey)
  swarm.join(discoveryWeb)
  swarm.flush().then(done, done)

  console.log(await core.get(0))
  console.log(await core.get(1))
  console.log(await core.get(2))
}

function createDHTRelay () {
  const socket = new WebSocket('wss://dht1-relay.leet.ar:49443')
  const dht = new DHT(new Stream(true, socket))
  return dht
}
```

## License

MIT
