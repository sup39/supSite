const fs0 = require('fs');
const fs = require('fs/promises');
const yaml = require('js-yaml');

/** @type {{[c: string]: string} */
const tableEscapeHTML = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;',
};

module.exports = {
  /**
   * @param {string} fpath -- path to yaml
   * @returns {any}
   */
  readYamlSync: fpath => yaml.load(fs0.readFileSync(fpath, 'utf8')),
  /**
   * @param {string} fpath -- path to yaml
   * @returns {Promise<any>}
   */
  readYaml: fpath => fs.readFile(fpath).then(buf => yaml.load(buf.toString())),

  /** @param {string} s */
  escapeHTML: s => s.replace(/[&"'<>]/g, m => tableEscapeHTML[m]),

  /** @param {any} err */
  printError: err => console.error(
    '\x1b[41m[ERROR]\x1b[0m \x1b[31m%s\x1b[0m%s',
    ...(err instanceof Array ? [err[0], err[1] && '\n'+err[1], ...err.slice(2)] : [err, '']),
  ),
};
