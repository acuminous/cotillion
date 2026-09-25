const { equal: eq, ok } = require('node:assert/strict');
const { execFile } = require('node:child_process');
const path = require('node:path');
const { promisify } = require('node:util');
const Yadda = require('yadda');

const {
  Dictionary,
  ContextParamLibrary,
  localisation: { English },
} = Yadda;

const run = promisify(execFile);

const program = path.join(__dirname, '..', 'lib', 'exit-on-program.js');

const dictionary = new Dictionary().define('code', /(\d+)/, async (digits) => Number(digits)).define('event', /(\w+)/);

module.exports = English.localise(new ContextParamLibrary(dictionary))
  .given('a program whose system exits on a process event', ({ world }) => {
    world.behaviour = 'clean';
  })
  .given("the program's postgres fails to start", ({ world }) => {
    world.behaviour = 'start-fails';
  })
  .given("the program's postgres fails to stop", ({ world }) => {
    world.behaviour = 'stop-fails';
  })
  .given('the program unbinds the exit before stopping', ({ world }) => {
    world.behaviour = 'unbound';
  })
  .when('the program runs', async ({ world }) => {
    world.exit = await run(process.execPath, [program, world.behaviour]).then(exited(0), (error) =>
      exited(error.code)(error),
    );
  })
  .then('the program exits with code $code', ({ world }, code) => {
    eq(world.exit.code, code, `the program printed:\n${world.exit.stdout}${world.exit.stderr}`);
  })
  .then('the program announced $event before exiting', ({ world }, event) => {
    ok(world.exit.stdout.split('\n').includes(event), `the program announced:\n${world.exit.stdout}`);
  });

function exited(code) {
  return ({ stdout, stderr }) => ({ code, stdout, stderr });
}
