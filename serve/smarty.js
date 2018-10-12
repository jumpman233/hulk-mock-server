/**
 * @file smarty server
 */
const {exec, execSync} = require('child_process');
const path = require('path');
const {
    resolve,
    join
} = path;

const Mock = require('mockjs');
const which = require('which');
const userHome = require('user-home');
const {
    readJsonSync,
    pathExistsSync,
    existsSync,
    stat
} = require('fs-extra');

const {name} = require('../package.json');
const {debug} = require('../lib/utils');

const PHP_FILE_PATH = resolve(__dirname, '../smarty/mocker.php');

/**
 * smarty server
 */
function serveSmarty(options) {
    const baseDir = resolve(options.baseDir || '');

    // 获取 php 路径
    let {
        bin,
        dataDir = resolve(baseDir, './mock/_data_')
    } = options;

    // 处理成标准目录
    dataDir = resolve(dataDir);

    if (!bin) {
        bin = which.sync('php', {
            nothrow: true
        });
    }
    else {
        bin = resolve(bin);
    }

    try {
        execSync(`${bin} -v`);
    }
    catch (e) {
        throw e;
    }

    // 判断template dir是否存在

    if (!pathExistsSync(baseDir)) {
        throw `Smarty template directory does not exist! ${baseDir}`;
    }

    const useMockData = pathExistsSync(dataDir);
    debug(useMockData, dataDir);

    return (req, res, next, filename) => {
        debug(filename);

        return new Promise((pResolve, reject) => {
            const orgiFilePath = resolve(baseDir, filename);

            // 先判断是不是目录
            stat(orgiFilePath).then((stat) => {
                if (stat.isDirectory()) {
                    return reject();
                }

                // 提前将确定量加入 cmd
                const cmd = [bin, PHP_FILE_PATH];

                // 将 smarty cache 放到 userhome 下面
                cmd.push(`--cache=${getQuoteString(join(userHome, `.${name}`))}`);
                cmd.push(`--dir=${getQuoteString(baseDir)}`);
                cmd.push(`--name=${getQuoteString(filename)}`);

                const infoCmd = [...cmd];
                if (useMockData) {
                    let t = findData(filename, dataDir);
                    if (t && t.file) {
                        dataFilePath = t.file;
                        cmd.push(`--data=${getQuoteString(JSON.stringify(t.data))}`);
                        infoCmd.push(`--data=${t.file}`);
                    }
                }

                const code = cmd.join(' ');

                debug(code);

                exec(code, (err, stdout, stderr) => {
                    if (err) {
                        debug(err, stderr);
                        stderr ? res.end(stderr) : stdout ? res.end(stdout) : res.end(err.toString());
                    }
                    else {
                        const info = ['<!--created by smarty', ...infoCmd, '--->'].join('\n');
                        const body = stdout + `${info}`;
                        res.setHeader('Content-Type', 'text/html; charset=utf-8');
                        res.setHeader('Content-Length', body.length);
                        res.end(body);
                    }
                    pResolve();
                });
            }).catch(reject);

        });
    };
}

function getQuoteString(str) {
    return JSON.stringify(str);
}

function findData(filename, rootDir) {
    const rs = {};
    // 查找data 地址，index.tpl → index.tpl.json → index.json
    //
    const arr = [resolve(rootDir, `./${filename}.json`)];
    if (~filename.lastIndexOf('.')) {
        const name = filename.slice(0, filename.lastIndexOf('.'));
        arr.push(resolve(rootDir, `./${name}.json`));
    }

    const result = arr.find((file) => {
        debug(file);

        try {
            let data = Mock.mock(readJsonSync(file));
            rs.file = file;
            rs.data = data;
            return true;
        }
        catch (e) {}
        return false;
    });

    return result ? rs : false;
}
module.exports = serveSmarty;
