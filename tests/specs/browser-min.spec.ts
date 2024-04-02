import * as expected from 'index.js';
import {readFileSync} from 'node:fs';
import vm = require('node:vm');

const ctxOptions:vm.CreateContextOptions = {
    codeGeneration: {strings: false, wasm: false},
    microtaskMode: 'afterEvaluate'
}
const runOptions:vm.RunningScriptOptions = {
    timeout: 500
}
test('browser.min.js', ()=>{
    const path0 = require.resolve('@browserfs/core/browser.min.js');
    const src0 = readFileSync(path0, 'utf8');

    const path = require.resolve('/../dist/browser.min.js');
    const src = readFileSync(path, 'utf8');
    const context:any = ((o:any)=>o.self=o.window=o)({
        TextEncoder, TextDecoder,
        AbortController, AbortSignal
    });

    vm.createContext(context, ctxOptions);
    vm.runInContext(src0, context, {filename: '@browserfs/core/browser.min.js', ...runOptions});
    vm.runInContext(src, context, {filename: 'browser.min.js', ...runOptions});
    expect(context.BrowserFS_DOM).toBeDefined();

    let name;
    for(name in expected)
    try {
        expect(typeof(context.BrowserFS_DOM[name]))
            .toBe(typeof(expected[name]));
    }
    catch (err) {
        err.message = `${name}: ${err.message}`
        throw err;
    }
})