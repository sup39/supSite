#!/usr/bin/env node
const fs0 = require('fs');
const fs = require('fs/promises');
const path = require('path');
const {validate} = require('schema-utils');
const {printError, readYamlSync, readYaml, escapeHTML} = require('./utils');
const printDebug = console.debug; // TODO

/**
 * @typedef {import('./types').Dirinfo} Dirinfo
 * @typedef {import('./types').FileCompiler} FileCompiler
 */

const schemasDir = path.join(__dirname, '../schemas');
/**
 * @param {string} name
 * @returns {any}
 */
const loadSchema = name => readYamlSync(path.join(schemasDir, name));
const schemaOptions = loadSchema('site.config.yml');
const schemaDirinfo = loadSchema('dirinfo.yml');

const configPath = process.env.SITE_CONFIG || './site.config.js'; // TODO
const optionsDefault = {
  srcRoot: path.join(path.dirname(configPath), 'src'),
  dstRoot: path.join(path.dirname(configPath), 'docs'),
  dirinfoName: '@dirinfo.yml',
  indexName: 'index.md',
  rules: [],
};

const configAPath = path.resolve(configPath);
if (!fs0.existsSync(configAPath)) {
  printError(`Config file ${configAPath} does not exist`);
  process.exit(1);
}
const optionsUser = require(configAPath);
validate(schemaOptions, optionsUser);

const options = {
  ...optionsDefault,
  .../**@type{import('./types').SiteOptions}*/(optionsUser),
};

const srcRoot = path.resolve(options.srcRoot);
const dstRoot = path.resolve(options.dstRoot);

/** @type {FileCompiler} */
const copyCompile = (src, dst) => fs.cp(src, dst, {recursive: true});

/**
 * @param {string} dirPath -- path to directory
 * @returns {Promise<Dirinfo>}
 */
const parseDirinfo = dirPath => new Promise((rsv, rjt) => {
  const {dirinfoName} = options;
  readYaml(path.join(dirPath, dirinfoName)).then((/**@type{Dirinfo}*/config) => {
    try {
      validate(schemaDirinfo, config);
    } catch (err) {
      return rjt([`Invalid ${dirinfoName} in ${path.resolve(dirPath)}`, err]);
    }
    rsv(config);
  }, err => {
    rjt([`Fail to open file ${dirinfoName} in ${path.resolve(dirPath)}`, err]);
  });
});

/**
 * @param {string} src -- file name (relative to source root)
 */
const getFileCompileInfo = src => {
  for (const {test, output, compile} of options.rules) {
    if (test.test(src)) {
      const srcParsed = path.parse(src);
      const dst = path.join(srcParsed.dir, output
        .replaceAll('[name]', srcParsed.name)
        .replaceAll('[ext]', srcParsed.ext),
      );
      return {src, dst, compile};
    }
  }
  return {src, dst: src, compile: copyCompile};
};

/**
 * @typedef {{
 *   src: string
 *   dst: string
 * } & ({
 *   type: 'src'
 *   title: string
 *   compile: FileCompiler
 * } | {
 *   type: 'static'
 *   compile: FileCompiler
 * } | {
 *   type: 'dir'
 *   title: string
 *   children: NavItem[]
 * })} NavItem
 * @param {string} dirRPath -- relative path from src root to directory
 * @returns {Promise<NavItem[]>}
 */
const listDir = async dirRPath => {
  const dirAPath = path.join(srcRoot, dirRPath);
  const info = await parseDirinfo(dirAPath);
  return await Promise.all([
    ...info.nav.map(async ({title, src: srcName}) => {
      const src = path.join(dirRPath, srcName);
      if (src.endsWith('/')) {
        const dst = src;
        const children = await listDir(dst);
        return /**@type{NavItem}*/({type: 'dir', title, src, dst, children});
      } else {
        const info = getFileCompileInfo(src);
        return /**@type{NavItem}*/({type: 'src', title, ...info});
      }
    }),
    ...(info.static?.map(srcName => {
      const src = path.join(dirRPath, srcName);
      const {dst, compile} = getFileCompileInfo(src);
      return /**@type{NavItem}*/({type: 'static', src, dst, compile});
    }) ?? []),
  ]);
};

const navCss = {
  svgFolderId: 'svg-folder',
  root: 'nav-root',
  dirCtn: 'nav-dir',
  entry: 'nav-entry',
  dirChild: 'nav-dir-child',
};

/**
 * @param {NavItem} info
 * @returns {string}
 */
function makeNavTag(info) {
  if (info.type === 'dir') {
    const title = escapeHTML(info.title);
    const href = escapeHTML(info.dst);
    const a = `<a href="${href}">${title}</a>`;
    const child = info.children.map(makeNavTag).join('');
    if (child === '') return `<div class="${navCss.entry}">${a}</div>`;
    const svgFolder = `<svg viewBox="0 0 8 8"><use xlink:href="#${navCss.svgFolderId}"/></svg>`;
    return `<div class="${navCss.dirCtn}"><div class="${navCss.entry}">${a}${svgFolder}</div><div class="${navCss.dirChild}">${child}</div></div>`;
  } else if (info.type === 'src') {
    const title = escapeHTML(info.title);
    const href = escapeHTML(info.dst);
    return `<div class="${navCss.entry}"><a href="${href}">${title}</a></div>`;
  } else {
    return '';
  }
}

const {indexName: indexSrcName} = options;
const {dst: indexDstName, compile: indexCompiler} = getFileCompileInfo(indexSrcName) ?? {
  dst: indexSrcName,
  compile: copyCompile,
};
/**
 * @param {NavItem} item
 * @param {string} nav
 */
async function compileFile(item, nav) {
  const {type} = item;
  const dstAPath = path.join(dstRoot, item.dst);
  const dstADir = type === 'dir' ? dstAPath : path.dirname(dstAPath);
  const srcAPath = path.join(srcRoot, item.src);
  // prepare dir
  await fs.mkdir(dstADir, {recursive: true});
  // compile file
  if (type === 'dir') {
    // compile index
    await indexCompiler(path.join(srcAPath, indexSrcName), path.join(dstAPath, indexDstName), nav);
    printDebug(path.join(item.src, indexSrcName), '->', path.join(item.dst, indexDstName));
    // compile children
    await Promise.all(item.children.map(c => compileFile(c, nav)));
  } else {
    await item.compile(srcAPath, dstAPath, nav);
    printDebug(item.src, '->', item.dst);
  }
}

listDir('/').then(async items => {
  const {name: title} = options;
  const home = `<a href="/" class="${navCss.root}">${escapeHTML(title)}</a>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none"><polyline id="${navCss.svgFolderId}" points="6 3 4 5 2 3"></polyline></svg>`;
  const nav = `<nav>${svg}${home}<div>${items.map(makeNavTag).join('')}</div></nav>`;
  // clear files
  await fs.readdir(dstRoot).then(
    fns => Promise.all(fns.map(fn => fs.rm(path.join(dstRoot, fn), {recursive: true, force: true}))),
    () => [], // ignore error
  );
  // compile files
  await compileFile({type: 'dir', src: '/', dst: '/', title, children: items}, nav);
}).catch(printError);
