const WebSocket = require('ws');
const https = require('https');
const { createHmac } = require('crypto');
const {
  getConfigObj,
  getRestApiUrl,
  getWsUrl,
  getWsStreamsUrl,
  getWsKeyRefreshInterval
} = require('./config.js')
const { handleExceptionsAndRejections } = require('./utils.js')
const latencyTracker = require('./latencyTracker.js')

handleExceptionsAndRejections()


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

const createWSAccountInfo = (address, state) => {
  const ws = new WebSocket(address);

  ws.on('open', () => {
    console.log(`WSAccountInfo: open`);
  });

  ws.on('message', (data) => {
    console.log('incoming data:', data)
    console.log(`typeof data`, typeof data);

    let parsedData
    try {
      parsedData = JSON.parse(data)
    }
    catch (e) {
      console.error('WSAccountInfo: error while parsing message: ', data)
      throw e;
    }

    switch (parsedData.e) {
      case 'outboundAccountPosition':
        parsedData['B'].forEach((el) => {
          if (Number(el.free) === 0 || Number(el.locked) === 0) {
            delete state.spot.nonZeroBalances[`${el.a}`];
          } else {
            state.spot.nonZeroBalances[`${el.a}`] = { free: el.f, locked: el.l }
          }
        })

        console.log(`Current non-zero spot account balances: `, state.spot.nonZeroBalances)
        break;
      /*
      note: can not test 'balanceUpdate' event on testnet yet and not 100% sure, that the "d"(Balance Delta) param actually mean the asset change and can have negative values, I would just do:

      case 'balanceUpdate':
        const currentBalanceObj = state.spot.nonZeroBalances[`${parsedData.a}`]
        const currentAmount = Number(currentBalanceObj.free) - Number(parsedData['d'])
        if (currentAmount <= 0 && Number(currentBalanceObj.locked) === 0) {
          delete state.spot.nonZeroBalances[`${parsedData.a}`];
        } else {
          state.spot.nonZeroBalances[`${parsedData.a}`] = {
            free: `${currentAmount}`,
            locked: currentBalanceObj.locked
          }
        }

        console.log(`Current non-zero spot account balances: `, state.spot.nonZeroBalances)
        break;
       */
    }
  });

  ws.on('error', (event) => {
    console.error(`WSAccountInfo: error ${error}`)
  });

  ws.on('close', (code, reason) => {
    console.log(`WSAccountInfo: close, code: ${code}, reason: ${reason}`)
  });
}

const createWSMarketsInfo = (address) => {
  const ws = new WebSocket(address);

  ws.on('open', () => {
    console.log(`WSMarketsInfo: open`);
  });

  ws.on('message', (data) => {});

  ws.on('error', (event) => {
    console.error(`WSMarketsInfo: error ${error}`)
  });

  ws.on('close', (code, reason) => {
    console.log(`WSMarketsInfo: close, code: ${code}, reason: ${reason}`)
  });
}


const periodicallyRefreshListenKey = (listenKeyToRefresh, interval = getWsKeyRefreshInterval()) => {
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

const getTheXMostTradedPairsByRelativeVolume = async (testnet = true, max = 10) => {
  const output = [];
  const stats24 = await get24HStats(false)
  stats24.sort((a, b) => Number(b.volume) - Number(a.volume))

  for (let i = 0; i < max; i++) {
    if (stats24[i]) {
      output.push(stats24[i])
    }
  }

  return output;
}

const getTheXMostTradedPairsByVolumeInSymbol = async (testnet = true, max = 10, comparisonBaseSymbol = 'USDT') => {
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

    if (element.symbol.indexOf(comparisonBaseSymbol) > 0) {
      currentPair = {
        ...currentPair,
        quoteVolumeBase: element.quoteVolume,
        quoteVolumeBaseNum: Number(element.quoteVolume)
      }
      statsMap[element.symbol] = currentPair

      pairsToSort.push(currentPair)
      usdtPriceMap[element.symbol.replace(comparisonBaseSymbol, '')] = Number(element.weightedAvgPrice)
    }
  })

  const exchangeInfo = await getExchangeInfo(false);

  exchangeInfo.symbols.forEach((el) => {
    const pairStats = statsMap[`${el.symbol}`]
    const assetPriceInUSDT = usdtPriceMap[`${el.baseAsset}`]
    if (pairStats && !pairStats.quoteVolumeBaseNum && assetPriceInUSDT) {
      const volumePrice = assetPriceInUSDT * Number(pairStats.volume);
      pairsToSort.push({
        ...pairStats,
        quoteVolumeBase: `${volumePrice}`,
        quoteVolumeBaseNum: volumePrice
      })
    }
  })

  const output = [];
  pairsToSort.sort((a, b) => b.quoteVolumeBaseNum - a.quoteVolumeBaseNum)
  for (let i = 0; i < max; i++) {
    if (pairsToSort[i]) {
      output.push(pairsToSort[i])
    }
  }

  return output;
}

(async () => {
  /*
    Task: "Log to console current non 0 asset balances available on the SPOT account (testnet)"
   */
  const state = {
    spot: {
      nonZeroBalances: {}
    }
  }
  const spotAccountInfo = await getSpotAccountInfo();
  spotAccountInfo.balances
    .filter((element) => Number(element.free) > 0 || Number(element.locked) > 0)
    .forEach((element) => {
      state.spot.nonZeroBalances[`${element.asset}`] = { free: element.free, locked: element.locked }
    });
  console.log(`Current non-zero spot account balances: `, state.spot.nonZeroBalances)

  /*
    Tasks:
      - "Open a single userData websocket (with all the requirement logic to keep the listenKey active)"
      - "Keep your local asset balances state up to date based on the data coming from userData"
      - "Log the asset balances again on every balance change"
   */
  const listenKey = await getWSListenKey()
  periodicallyRefreshListenKey(listenKey)
  createWSAccountInfo(getWsUrl(listenKey), state)

  /*
    Tasks:
      - "Open 10 *@trade websockets for the 10 pairs with the highest volume in the last 24h on the SPOT exchange (mainnet)"
      - "Determinate the 10 pairs dynamically (no hard-coded pairs)"

    Note: The 10 pairs could be interpreted in multiple ways, the most logical is to assume the volume in some representative stablecoin/fiat volume,
    if you would like to simply see the results by the relative volume of the pair please the call of getTheXMostTradedPairsByRelativeVolume() fn
    anyway both of those algorithms have big O complexity time (n * log(n)) due to native Array.sort call which is basically a merge sort
   */
  const most10TradedPairsStats = await getTheXMostTradedPairsByVolumeInSymbol(false) // or -> getTheXMostTradedPairsByRelativeVolume()
  const most10TradedPairs = most10TradedPairsStats.map((el) => el.symbol.toLocaleLowerCase())
  const wsStreamUrl = getWsStreamsUrl(most10TradedPairs, false)
  console.log(`Opening @trade streams: ${most10TradedPairs.join(', ')}`)
  createWSMarketsInfo(wsStreamUrl)

  /*
    Task: "Measure event time => client receive time latency and log (min/mean/max) to console every 1 minute"
   */
  latencyTracker()
  const intervalID = setInterval(() => {
    latencyTracker()
  }, 60 * 1000)
})()


