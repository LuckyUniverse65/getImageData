'use strict';
// Test the actual installed package, using the full shared native contract.
process.argv[2] ||= require.resolve('lucky65_canvas', {paths: [process.cwd()]});
require('./test-native-api.js');
