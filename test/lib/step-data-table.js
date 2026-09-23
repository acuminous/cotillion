function parseStepDataTable(text) {
  const [heading, ...rows] = text.split('\n');
  const columns = toCells(heading);
  return rows.map((row) => toRow(columns, toCells(row)));
}

function toCells(line) {
  return line.split('|').map((cell) => cell.trim());
}

function toRow(columns, cells) {
  return columns.reduce((row, column, index) => Object.assign(row, { [column]: cells[index] ?? '' }), {});
}

module.exports = { parseStepDataTable };
