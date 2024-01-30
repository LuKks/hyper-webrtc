const test = require('brittle')

const { WebSocket, WebSocketServer } = require('ws')
const DHTRelay = require('@hyperswarm/dht-relay')
const { relay } = require('@hyperswarm/dht-relay')
const Stream = require('@hyperswarm/dht-relay/ws')

const DHT = require('hyperdht')
const createTestnet = require('hyperdht/testnet')

const Hyperswarm = require('hyperswarm')
const Hypercore = require('hypercore')
const RAM = require('random-access-memory')
const crypto = require('hypercore-crypto')
const HypercoreId = require('hypercore-id-encoding')
const HyperWebRTC = require('./index.js')

test('basic', async function (t) {
  // t.plan(1)

  const bootstrap = await createBootstrap(t)
  const relayAddress = createRelayServer(t, { bootstrap })

  const key = await writer(t, { relayAddress })

  await reader(t, key, { relayAddress })

  // await new Promise(resolve => setTimeout(resolve, 5000))
})

async function writer (t, { relayAddress }) {
  const dht = createRelayClient(t, relayAddress)
  const swarm = new Hyperswarm({ dht })
  t.teardown(() => swarm.destroy())

  const core = new Hypercore(RAM)
  await core.append(['a', 'b', 'c'])
  t.teardown(() => core.close())

  const done = core.findingPeers()
  swarm.on('connection', function (signal) {
    const peer = new HyperWebRTC(signal)

    peer.on('continue', function (stream) {
      console.log('core replicate')
      core.replicate(stream)
    })
  })
  const discoveryWeb = crypto.discoveryKey(core.discoveryKey)
  const discovery = swarm.join(discoveryWeb)
  swarm.flush().then(done, done)

  await discovery.flushed()
  console.log('Fully announced')

  console.log('Writer ID', core.id)

  return core.id
}

async function reader (t, key, { relayAddress }) {
  const dht = createRelayClient(t, relayAddress)
  const swarm = new Hyperswarm({ dht })
  t.teardown(() => swarm.destroy())

  const clone = new Hypercore(RAM, HypercoreId.decode(key))
  await clone.ready()
  t.teardown(() => clone.close())

  const done = clone.findingPeers()
  swarm.on('connection', function (signal) {
    const peer = new HyperWebRTC(signal)

    peer.on('continue', function (stream) {
      console.log('clone replicate')
      clone.replicate(stream)
    })
  })
  const discoveryWeb = crypto.discoveryKey(clone.discoveryKey)
  swarm.join(discoveryWeb)
  swarm.flush().then(done, done)

  console.log(await clone.get(0))
  console.log(await clone.get(1))
  console.log(await clone.get(2))
}

function createRelayClient (t, relayAddress) {
  const ws = new WebSocket(relayAddress)
  const dht = new DHTRelay(new Stream(true, ws))

  t.teardown(() => dht.destroy(), { order: Infinity })

  return dht
}

function createRelayServer (t, { bootstrap }) {
  // const dht = new DHT({ bootstrap, quickFirewall: false, ephemeral: true })

  const dht = new DHT({ bootstrap })
  const server = new WebSocketServer({ port: 0 })

  server.on('connection', function (socket) {
    relay(dht, new Stream(false, socket))
  })

  // await waitForServer(server)

  t.teardown(async function () {
    console.log('teardown')
    await new Promise(resolve => server.close(resolve))
    await dht.destroy()
  })

  return 'ws://127.0.0.1:' + server.address().port
}

async function createBootstrap (t) {
  const testnet = await createTestnet(4, { teardown: t.teardown })

  t.teardown(() => testnet.destroy(), { order: Infinity })

  return testnet.bootstrap
}

/* function waitForServer (server) {
  return new Promise((resolve, reject) => {
    server.on('listening', done)
    server.on('error', done)

    function done (err) {
      server.off('listening', done)
      server.off('error', done)

      if (err) reject(err)
      else resolve()
    }
  })
} */
