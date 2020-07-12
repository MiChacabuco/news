const gobierno = require("./strategies/gobierno");

exports.handler = async () => {
  await gobierno.start();
};
