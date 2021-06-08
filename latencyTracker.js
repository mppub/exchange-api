const https = require('https');

const {getRestApiUrl} = require('./config.js')

const latencyStats = {
  ttfbRequests: BigInt(0),
  ttfbSum: BigInt(0),
  ttfb: {
    min: null,
    max: null,
    mean: null
  }
}
const nsMsDivisor = BigInt(Math.pow(10,6))

const latencyTracker = (testnet = true) => {
  const start = process.hrtime.bigint();
  https.get(`${getRestApiUrl(testnet)}ping`, {}, (res) => {
    let output
    res.once('readable', () => {
      const ttfb = process.hrtime.bigint() - start;
      latencyStats.ttfbRequests++;
      latencyStats.ttfbSum += ttfb;
      if (!latencyStats.ttfb.min) {
        latencyStats.ttfb = {
          min: ttfb,
          max: ttfb,
          mean: ttfb
        }
      } else {
        latencyStats.ttfb = {
          min: ttfb < latencyStats.ttfb.min ? ttfb : latencyStats.ttfb.min,
          max: ttfb > latencyStats.ttfb.max ? ttfb : latencyStats.ttfb.max,
          mean: latencyStats.ttfbSum / latencyStats.ttfbRequests
        }
      }
      console.log(`TTFB in ns - mean: ${latencyStats.ttfb.mean}, max: ${latencyStats.ttfb.max}, min: ${latencyStats.ttfb.min}`)
      console.log(`TTFB in ms - mean: ${latencyStats.ttfb.mean / nsMsDivisor}, max: ${latencyStats.ttfb.max / nsMsDivisor}, min: ${latencyStats.ttfb.min / nsMsDivisor}`)
    })
    res.on('data', (chunk) => { output += chunk })
    res.on('end', () => {})
  }).on('error', (error) => {
    console.error(`latencyTracker: req`);
    reject(error);
  })
}


module.exports = latencyTracker
