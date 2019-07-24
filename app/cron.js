const CronJob = require('cron').CronJob;
const index = require('./index.js');

const job = new CronJob('*/5 * * * * *', () => {
    index.start();
});

job.start();