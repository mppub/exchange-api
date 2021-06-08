const { setEnvVariablesSync } = require('./utils')

setEnvVariablesSync()

const config = {
  testnet: {
    restBaseUrl: 'https://testnet.binance.vision',
    restApiPathPrefix: '/api/v3/',
    wsBaseUrl: 'wss://testnet.binance.vision',
    wsWSPathPrefix: '/ws',
    wsStreamPath: '/stream',
    authentiaction: {
      apiKey: process.env.TESTNET_API_KEY,
      secretKey: process.env.TESTNET_SECRET_KEY,
      wsKeyRefreshInterval: 30 * 60 * 1000
    }
  },
  mainnet: {
    restBaseUrl: 'https://api.binance.com',
    restApiPathPrefix: '/api/v3/',
    wsBaseUrl: 'wss://stream.binance.com:9443',
    wsWSPathPrefix: '/ws',
    wsStreamPath: '/stream',
    authentiaction: {
      apiKey: process.env.MAINNET_API_KEY,
      secretKey: process.env.MAINNET_SECRET_KEY,
      wsKeyRefreshInterval: 30 * 60 * 1000
    }
  }
}



const getConfigObj = (testnet) => testnet ? config.testnet : config.mainnet
const getRestApiUrl = (testnet = true) => `${getConfigObj(testnet).restBaseUrl}${getConfigObj(testnet).restApiPathPrefix}`
const getWsUrl = (listenKey, testnet = true) => `${getConfigObj(testnet).wsBaseUrl}${getConfigObj(testnet).wsWSPathPrefix}/${listenKey}`
const getWsStreamUrl = (stream, testnet = true) => `${getConfigObj(testnet).wsBaseUrl}/ws/${stream}`
const getWsStreamsUrl = (streams, testnet = true, suffix = '@trade') => `${getConfigObj(testnet).wsBaseUrl}/stream?streams=${streams.join(`${suffix}/`)}${suffix}`
const getWsKeyRefreshInterval = (testnet = true) => `${getConfigObj(testnet).authentiaction.wsKeyRefreshInterval}`

module.exports = {
  getConfigObj,
  getRestApiUrl,
  getWsUrl,
  getWsStreamUrl,
  getWsStreamsUrl,
  getWsKeyRefreshInterval
}
