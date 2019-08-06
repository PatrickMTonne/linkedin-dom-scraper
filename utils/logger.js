const { createLogger, format, transports } = require('winston');
const { combine, timestamp, label, prettyPrint } = format;

const logger = createLogger({
  format: combine(
    label({ label: 'right meow!' }),
    timestamp(),
    prettyPrint()
  ),
  transports: [new transports.Console()]
});

logger.log({
  level: 'info',
  message: 'What time is the testing at?'
});

module.exports = logger;










// const aws = require('aws-sdk');
//
// aws.config.update({region: 'us-east-1'});
//
// const cw = new aws.CloudWatch({apiVersion: '2010-08-01'});
//
// const params = {
//   Dimensions: [
//     {
//       Name: 'LogGroupName',
//     },
//   ],
//   MetricName: 'IncomingLogEvents',
//   Namespace: 'AWS/Logs'
// };
//
// cw.listMetrics(params, function(err, data) {
//   if (err) {
//     console.log("Error", err);
//   } else {
//     console.log("Metrics", JSON.stringify(data.Metrics));
//   }
// });
