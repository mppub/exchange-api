const { readFileSync } = require('fs');

const notify = () => {
  // To be implemented: call / send a message to relevant users about fatal crash
}

const setEnvVariablesSync = () => {
  const envFile = readFileSync('.env.json')
  try {
    const envVariables = JSON.parse(envFile.toString());
    process.env = { ...process.env, ...envVariables};
  } catch (e) {
    console.error(`error while parsing env file: `, e);
  }
}

const handleExceptionsAndRejections = (notifyFn = notify, log = console.error) => {
  process
    .on('unhandledRejection', (reason, p) => {
      log('Unhandled Rejection: ', reason, '\n at Promise: ', p)
    })
    .on('uncaughtException', (error) => {
      log('Uncaught Exception: ', error)
      notifyFn()
      process.exit(1)
    })
}

module.exports = {
  setEnvVariablesSync,
  handleExceptionsAndRejections
};
