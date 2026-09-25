const { deepEqual: deq, equal: eq } = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const Yadda = require('yadda');
const { ComponentEvent, SystemEvent } = require('../../lib');

const {
  Dictionary,
  ContextParamLibrary,
  localisation: { English },
} = Yadda;

const root = path.join(__dirname, '..', '..');

const dictionary = new Dictionary().define('scope', /(component|system)/);

const exportedEventsOf = { component: ComponentEvent, system: SystemEvent };

module.exports = English.localise(new ContextParamLibrary(dictionary))
  .given('the README', ({ world }) => {
    world.readme = readFileSync(path.join(root, 'README.md'), 'utf8');
  })
  .then('its $scope events table lists exactly the exported $scope events', ({ world }, scope) => {
    deq(firstColumnOf(world.readme, `### ${capitalise(scope)} events`), Object.values(exportedEventsOf[scope]));
  })
  .then('its errors table lists exactly the error types the library constructs', ({ world }) => {
    deq(firstColumnOf(world.readme, '## Errors').sort(), constructedErrorTypes().sort());
  })
  .then('the Node.js version it requires is the one the package declares', ({ world }) => {
    const [, required] = world.readme.match(/- Node\.js (\d+) or later/);
    eq(`>=${required}`, packageJson().engines.node);
  })
  .then('the package has no production dependencies', () => {
    deq(packageJson().dependencies, undefined);
    deq(packageJson().peerDependencies, undefined);
  })
  .then('the library calls process.exit only where exitOn is implemented', () => {
    const callers = librarySources().filter((source) => source.text.includes('process.exit'));
    deq(
      callers.map((source) => source.file),
      ['exit-listeners.js'],
    );
  });

function firstColumnOf(readme, heading) {
  const lines = readme.slice(readme.indexOf(`\n${heading}\n`)).split('\n');
  const start = lines.findIndex((line) => line.startsWith('|'));
  const table = lines.slice(start).findIndex((line) => !line.startsWith('|'));
  return lines.slice(start + 2, start + table).map((row) => row.split('|')[1].trim());
}

function constructedErrorTypes() {
  const constructed = librarySources().flatMap((source) => source.text.match(/new ([A-Za-z]*Error)\(/g) ?? []);
  return [...new Set(constructed.map((expression) => expression.slice(4, -1)))];
}

function librarySources() {
  const lib = path.join(root, 'lib');
  return readdirSync(lib)
    .filter((file) => file.endsWith('.js'))
    .map((file) => ({ file, text: readFileSync(path.join(lib, file), 'utf8') }));
}

function packageJson() {
  return JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
}

function capitalise(word) {
  return word[0].toUpperCase() + word.slice(1);
}
