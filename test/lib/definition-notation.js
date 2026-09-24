function parseDefinition(notation) {
  const root = [];
  const stack = [root];

  for (const token of tokenise(notation)) {
    if (token === '[') {
      const group = [];
      stack.at(-1).push(group);
      stack.push(group);
      continue;
    }
    if (token === ']') {
      stack.pop();
      continue;
    }
    stack.at(-1).push(toEntry(token));
  }

  return root;
}

function tokenise(notation) {
  return notation.match(/\[|\]|"[^"]*"|[^,[\]\s]+/g) ?? [];
}

function toEntry(token) {
  if (isLiteral(token)) return parseValue(token);
  return { name: token };
}

const literals = { true: true, false: false };

function parseValue(token) {
  if (token.startsWith('"')) return token.slice(1, -1);
  if (token in literals) return literals[token];
  return Number(token);
}

function isLiteral(token) {
  return token.startsWith('"') || /^-?\d+$/.test(token);
}

function definitionNamed(entries, name) {
  const definition = findDefinition(entries, name);
  if (definition) return definition;
  throw new Error(`The scenario declares no component called ${name}`);
}

function findDefinition(entries, name) {
  for (const entry of entries) {
    if (Array.isArray(entry)) {
      const found = findDefinition(entry, name);
      if (found) return found;
      continue;
    }
    if (entry?.name === name) return entry;
  }
}

module.exports = { definitionNamed, parseDefinition, parseValue };
