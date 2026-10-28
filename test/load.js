// Loads Apps Script .gs files into a Node vm context (they are plain global scripts).
const vm = require('vm'), fs = require('fs'), path = require('path');
module.exports = function load(files, extra) {
  const ctx = vm.createContext(Object.assign({ console, Intl, Math, Date, JSON, Object, Array, String, Number, parseInt, parseFloat, isFinite, isNaN, RegExp, Error, encodeURIComponent, decodeURIComponent, setTimeout }, extra || {}));
  files.forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
  return ctx;
};
