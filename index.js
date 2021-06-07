const WebSocket = require('ws');
const https = require('https');
const { createHmac } = require('crypto');
const { setEnvVariablesSync, handleExceptionsAndRejections } = require('./utils.js')
/*

Prerequisites:
  - Runs on node.js (latest LTS version)
  - Maximum of 2 external libraries allowed (less the better) (sub-dependencies do not count here)
  - No binance/crypto related libraries allowed
  - SPOT testnet available at https://testnet.binance.vision
  - SPOT mainnet available at https://www.binance.com
  - SPOT documentation available at https://binance-docs.github.io/apidocs/spot/en/#change-log

  Tasks:
  - Log to console current non 0 asset balances available on the SPOT account (testnet)
  - Open a single userData websocket (with all the requirement logic to keep the listenKey active)
  wss://stream.binance.com:9443

  - Keep your local asset balances state up to date based on the data coming from userData
  - Log the asset balances again on every balance change



  - Open 10 *@trade websockets for the 10 pairs with the highest volume in the last 24h on the SPOT exchange (mainnet)
    - https://binance-docs.github.io/apidocs/spot/en/#current-average-price
    - https://binance-docs.github.io/apidocs/spot/en/#24hr-ticker-price-change-statistics
    - or https://binance-docs.github.io/apidocs/spot/en/#individual-symbol-mini-ticker-stream if v the same
  - Determinate the 10 pairs dynamically (no hard-coded pairs)


  - Measure event time => client receive time latency and log (min/mean/max) to console every 1 minute
    - https://binance-docs.github.io/apidocs/spot/en/#test-connectivity
 */

setEnvVariablesSync();
handleExceptionsAndRejections()

/*
mainnet: wss://stream.binance.com:9443
 */


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

const getSignature = (data, testnet = true) => {
  const key = getConfigObj(testnet).authentiaction.secretKey
  if (!data || !key) {
    throw new Error('getSignature: "data" and "key" params required.')
  }

  const hmac = createHmac('sha256', key);
  return hmac.update(data).digest('hex');
}

const getSignatureDataParam = (queryString, body) => queryString + ( body ? JSON.stringify(body) : '')

const getSpotAccountInfo = (testnet = true) => {
  return new Promise((resolve, reject) => {
    const queryParams = `timestamp=${Date.now()}`
    https.get(`${getRestApiUrl(testnet)}account?${queryParams}&signature=${getSignature(getSignatureDataParam(queryParams))}`, {
      headers: {
        'Content-Type': 'application/json',
        'X-MBX-APIKEY': getConfigObj(testnet).authentiaction.apiKey
      }
    }, (response) => {
      let output = ''
      response.on('data', (data) => {
        output += data
      })

      response.on('end', () => {
        try {
          const spotAccountInfo = JSON.parse(output);
          resolve(spotAccountInfo);
        } catch (e) {
          console.error(`getSpotAccountInfo: error while parsing the response`);
          reject(e);
        }
      })
    }).on('error', (error) => {
      console.error(`getSpotAccountInfo: req`);
      reject(error);
    })
  })
}



const getWSListenKey = (refreshListenKey, testnet = true) => {
  return new Promise((resolve, reject) => {
    const url = `${getRestApiUrl(testnet)}userDataStream${refreshListenKey ? `?listenKey=${refreshListenKey}` : ``}`
    const options = {
      method: !refreshListenKey ? 'POST' : 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-MBX-APIKEY': getConfigObj(testnet).authentiaction.apiKey,
      }
    }

    const request = https.request(url, options, (response) => {
      let listenKey = ''
      response.on('data', (data) => {
        listenKey += data
      })

      response.on('end', () => {
        try {
          resolve(!refreshListenKey ? JSON.parse(listenKey).listenKey : listenKey)
        } catch(e) {
          console.error(`getWSListenKey: error while parsing the response`);
          reject(e)
        }
      })
    }).on('error', (error) => {
      console.error(`getSpotAccountInfo: req`);
      reject(error);
    })

    request.end();
  })
}

const createWSClient = (address, state) => {
  console.log(address)
  const ws = new WebSocket(address);

  ws.on('open', function open(ev) {
    console.log('connection open', ev)
    // ws.send('something');
  });

  ws.on('message', function incoming(data) {
    console.log('incoming data:')

    /* TODO:
    update state prices according to those events that should arrive:
    - https://binance-docs.github.io/apidocs/spot/en/#payload-account-update
    - https://binance-docs.github.io/apidocs/spot/en/#payload-balance-update
     */
    console.log(data);
  });

  ws.on('error', function incoming(event) {
    console.log('error:')
    console.log(event);
  });

  ws.on('close', function incoming(event) {
    console.log('close:')
    console.log(event);
  });
}

const periodicallyRefreshListenKey = (listenKeyToRefresh, interval = config.testnet.authentiaction.wsKeyRefreshInterval) => {
  const callbackFn = (consecutiveErrorsCount = 0) => {
    getWSListenKey(listenKeyToRefresh).then(() => {
      periodicallyRefreshListenKey(listenKeyToRefresh);
    }).catch((err) => {
      consecutiveErrorsCount++
      if (consecutiveErrorsCount >= maxConsecutiveErrors) {
        throw new Error(`periodicallyRefreshListenKey: repeatedly could not refresh ${consecutiveErrorsCount}`)
      }
      else {
        callbackFn(consecutiveErrorsCount)
      }
    })
  }
  setTimeout(callbackFn, interval)
}

const get24HStats = (testnet = true) => {
  return new Promise((resolve, reject) => {
    https.get(`${getRestApiUrl(testnet)}ticker/24hr`, {}, (response) => {
      let output = ''
      response.on('data', (data) => {
        output += data
      })

      response.on('end', () => {
        try {
          resolve(JSON.parse(output));
        } catch (e) {
          console.error(`get24HStats: error while parsing the response`);
          reject(e);
        }
      })
    }).on('error', (error) => {
      console.error(`get24HStats: req`);
      reject(error);
    })
  })
}

const getExchangeInfo = (testnet = true) => {
  return new Promise((resolve, reject) => {
    https.get(`${getRestApiUrl(testnet)}exchangeInfo`, {}, (response) => {
      let output = ''
      response.on('data', (data) => {
        output += data
      })

      response.on('end', () => {
        try {
          resolve(JSON.parse(output));
        } catch (e) {
          console.error(`getExchangeInfo: error while parsing the response`);
          reject(e);
        }
      })
    }).on('error', (error) => {
      console.error(`getExchangeInfo: req`);
      reject(error);
    })
  })
}
/*
const getTheXMostTradedPairsByVolumeOld = async (testnet = true, max = 10, comparisonBaseSymbol = 'USDT') => {
  const res = await get24HStats();

  // list of heuristics:
  // - USD === USDT:)

  const pairsToSort = [];
  const output = [];
  const usdtPriceMap = {}
  const tempPairs = [];
  res.forEach((element) => {
    const currentPair = {
      symbol: element.symbol,
      weightedAvgPrice: element.weightedAvgPrice,
      volume: element.volume,
      quoteVolume: element.quoteVolume
    }
    if (element.symbol.indexOf('USDT') > 0) {
      pairsToSort.push({
        ...currentPair,
        quoteVolumeUSDT: element.quoteVolume,
        quoteVolumeUSDTNum: Number(element.quoteVolume)
      })
      usdtPriceMap[element.symbol.replace('USDT', '')] = Number(element.weightedAvgPrice)
    }
    else {
      tempPairs.push(currentPair)
    }
  })

  tempPairs.forEach((element) => {
    const symbol = element.symbol.replace('USDT', '')
    // todo
    const assetPriceInUSDT = usdtPriceMap[symbol];
    if (assetPriceInUSDT) {
      const usdtPrice = Number(element.volume) * assetPriceInUSDT;
      pairsToSort.push({
        symbol: element.symbol,
        weightedAvgPrice: element.weightedAvgPrice,
        volume: element.volume,
        quoteVolumeUSDT: `${usdtPrice}`,
        quoteVolumeUSDTNum: usdtPrice
      })
    }
  })

  pairsToSort.sort((a, b) => b.quoteVolumeUSDTNum - a.quoteVolumeUSDTNum)
  for (let i = 0; i < max; i++) {
    if (pairsToSort[i]) {
      output.push(pairsToSort[i])
    }
  }
  console.log(output.length, output)
}
*/

const getTheXMostTradedPairsByVolume = async (testnet = true, max = 10, comparisonBaseSymbol = 'USDT') => {
  const stats24 = await get24HStats(false);
  const pairsToSort = [];
  const statsMap = {}
  const usdtPriceMap = {}

  stats24.forEach((element) => {
    let currentPair = {
      symbol: element.symbol,
      weightedAvgPrice: element.weightedAvgPrice,
      volume: element.volume,
      quoteVolume: element.quoteVolume
    }
    statsMap[element.symbol] = currentPair

    if (element.symbol.indexOf('USDT') > 0) {
      currentPair = {
        ...currentPair,
        quoteVolumeUSDT: element.quoteVolume,
        quoteVolumeUSDTNum: Number(element.quoteVolume)
      }
      statsMap[element.symbol] = currentPair

      pairsToSort.push(currentPair)
      usdtPriceMap[element.symbol.replace('USDT', '')] = Number(element.weightedAvgPrice)
    }
  })

  const exchangeInfo = await getExchangeInfo(false);

  exchangeInfo.symbols.forEach((el) => {
    const pairStats = statsMap[`${el.symbol}`]
    const assetPriceInUSDT = usdtPriceMap[`${el.baseAsset}`]
    if (pairStats && !pairStats.quoteVolumeUSDTNum && assetPriceInUSDT) {
      const volumePrice = assetPriceInUSDT * Number(pairStats.volume);
      pairsToSort.push({
        ...pairStats,
        quoteVolumeUSDT: `${volumePrice}`,
        quoteVolumeUSDTNum: volumePrice
      })
    }
  })

  const output = [];
  pairsToSort.sort((a, b) => b.quoteVolumeUSDTNum - a.quoteVolumeUSDTNum)
  for (let i = 0; i < max; i++) {
    if (pairsToSort[i]) {
      output.push(pairsToSort[i])
    }
  }
  console.log('finish 3')
  console.log(Date.now())
  console.log(output.length, output)
}



(async () => {
  // const state = {
  //   spot: {
  //     nonZeroBalances: []
  //   }
  // }
  // const spotAccountInfo = await getSpotAccountInfo();
  // // console.log('spotAccountInfo', spotAccountInfo)
  // state.spot.nonZeroBalances = spotAccountInfo.balances.filter((element) => Number(element.free) > 0);
  // console.log(`Current non-zero spot account balances: `, state.spot.nonZeroBalances)
  //
  //
  // const listenKey = await getWSListenKey()
  // periodicallyRefreshListenKey(listenKey)
  // // open WS
  // createWSClient(getWsUrl(listenKey), state)
  // const res = await getTheXMostTradedPairsByVolume();
  // console.log(res)
  getTheXMostTradedPairsByVolume()
})()


