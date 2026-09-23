function parseComponents(notation) {
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

function parseValue(token) {
  if (token.startsWith('"')) return token.slice(1, -1);
  return Number(token);
}

function isLiteral(token) {
  return token.startsWith('"') || /^-?\d+$/.test(token);
}

function componentNamed(entries, name) {
  const component = findComponent(entries, name);
  if (component) return component;
  throw new Error(`The scenario declares no component called ${name}`);
}

function findComponent(entries, name) {
  for (const entry of entries) {
    if (Array.isArray(entry)) {
      const found = findComponent(entry, name);
      if (found) return found;
      continue;
    }
    if (entry?.name === name) return entry;
  }
}

module.exports = { componentNamed, parseComponents, parseValue };
