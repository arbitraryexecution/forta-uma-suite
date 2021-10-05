const { getHardhatConfig } = require("@uma/common");

const path = require("path");
const coreWkdir = path.dirname(require.resolve("@uma/contracts-node/package.json"));

const configOverride = {
  paths: {
    root: coreWkdir,
    artifacts: `${coreWkdir}/dist/core/artifacts`,
    tests: `${process.cwd()}/tests`,
  },
};

module.exports = getHardhatConfig(configOverride, coreWkdir, false);
