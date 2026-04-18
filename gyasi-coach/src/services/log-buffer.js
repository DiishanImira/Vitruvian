'use strict';

const MAX_LINES = 500;
const buffer = [];

function push(level, args) {
  const line = `[${new Date().toISOString()}] [${level}] ${args.map(a =>
    typeof a === 'string' ? a : JSON.stringify(a)
  ).join(' ')}`;
  buffer.push(line);
  if (buffer.length > MAX_LINES) buffer.shift();
}

const _log   = console.log.bind(console);
const _warn  = console.warn.bind(console);
const _error = console.error.bind(console);

console.log = (...args) => { push('INFO',  args); _log(...args); };
console.warn  = (...args) => { push('WARN',  args); _warn(...args); };
console.error = (...args) => { push('ERROR', args); _error(...args); };

function getLogBuffer(limit = 200) {
  const n = Math.min(limit, buffer.length);
  return buffer.slice(-n);
}

module.exports = { getLogBuffer };
