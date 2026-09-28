const { deepEqual: deq, equal: eq, ok } = require('node:assert/strict');
const { execFile } = require('node:child_process');
const path = require('node:path');
const { promisify } = require('node:util');
const Yadda = require('yadda');
const { createSystem } = require('../../lib');
const { parseValue } = require('../lib/definition-notation');
const { parseStepDataTable } = require('../lib/step-data-table');

const {
  Dictionary,
  ContextParamLibrary,
  localisation: { English },
} = Yadda;

const run = promisify(execFile);

const program = path.join(__dirname, '..', 'lib', 'exiting-program.js');

const dictionary = new Dictionary()
  .define('code', /(\d+)/, async (digits) => Number(digits))
  .define('codeDescription', /(no code|the code \d+)/, async (phrase) => phrase.replace(/\D/g, '') || 'none')
  .define('event', /(\w+)/)
  .define('events', /([\s\S]+)/, async (text) => parseStepDataTable(text))
  .define('value', /(-?\d+(?:\.\d+)?|"[^"]*"|true|false)/, async (token) => parseValue(token))
  .define('message', /"([^"]+)"/);

module.exports = English.localise(new ContextParamLibrary(dictionary))
  .given('a program whose system exits on a process event', ({ world }) => {
    world.program = { behaviour: 'signal', failure: 'none', code: 'none' };
  })
  .given('a program whose system exits on a termination signal', ({ world }) => {
    world.program = { behaviour: 'terminate', failure: 'none', code: 'none' };
  })
  .given('a program whose system exits itself with $codeDescription', ({ world }, code) => {
    world.program = { behaviour: 'exit', failure: 'none', code };
  })
  .given('a program whose system exits itself with $codeDescription while starting', ({ world }, code) => {
    world.program = { behaviour: 'exit-while-starting', failure: 'none', code };
  })
  .given('a program whose system exits itself with $codeDescription when the start fails', ({ world }, code) => {
    world.program = { behaviour: 'exit-when-start-fails', failure: 'none', code };
  })
  .given('a program whose system exits itself with $codeDescription after stopping', ({ world }, code) => {
    world.program = { behaviour: 'exit-after-stopping', failure: 'none', code };
  })
  .given('a program whose system exits itself with $codeDescription without starting', ({ world }, code) => {
    world.program = { behaviour: 'exit-without-starting', failure: 'none', code };
  })
  .given('the program sets process.exitCode to 5 before exiting', ({ world }) => {
    world.program.behaviour = 'exit-after-setting-exit-code';
  })
  .given("the program's postgres fails to start", ({ world }) => {
    world.program.failure = 'start-fails';
  })
  .given("the program's postgres fails to stop", ({ world }) => {
    world.program.failure = 'stop-fails';
  })
  .given("the program's postgres fails after starting, and the program restarts the system", ({ world }) => {
    world.program.behaviour = 'component-fails';
  })
  .given('the program unbinds the exit before stopping', ({ world }) => {
    world.program.behaviour = 'unbound';
  })
  .when('the program runs', async ({ world }) => {
    const { behaviour, failure, code } = world.program;
    world.exit = await run(process.execPath, [program, behaviour, failure, code]).then(exited(0), (error) =>
      exited(error.code)(error),
    );
  })
  .when('the system is asked to exit with the code $value', ({ world }, code) => {
    world.error = errorFrom(() => createSystem(world.definition).exit(code));
  })
  .then('the program exits with code $code', ({ world }, code) => {
    eq(world.exit.code, code, `the program printed:\n${world.exit.stdout}${world.exit.stderr}`);
  })
  .then('the program announced $event before exiting', ({ world }, event) => {
    ok(world.exit.stdout.split('\n').includes(event), `the program announced:\n${world.exit.stdout}`);
  })
  .then('before exiting the program announced:\n$events', ({ world }, expected) => {
    deq(traceOf(world.exit.stdout), expected);
  });

function traceOf(stdout) {
  return stdout
    .split('\n')
    .filter(Boolean)
    .map((event) => ({ event }));
}

function exited(code) {
  return ({ stdout, stderr }) => ({ code, stdout, stderr });
}

function errorFrom(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
}
